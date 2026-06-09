import { supabase } from './supabase';

export type ScoutApplicationStatus = 'pending' | 'approved' | 'declined' | 'withdrawn';

export interface ScoutApplication {
  id: string;
  applicant_id: string;
  status: ScoutApplicationStatus;
  pitch: string;
  region: string;
  specialties: string[];
  reviewer_id: string | null;
  reviewer_note: string;
  created_at: string;
  updated_at: string;
}

const MAX_PITCH = 2000;

export async function submitScoutApplication(input: {
  applicantId: string;
  pitch: string;
  region?: string;
  specialties?: string[];
}): Promise<{ application: ScoutApplication | null; error: string | null }> {
  const pitch = (input.pitch ?? '').slice(0, MAX_PITCH);
  if (pitch.trim().length < 20) {
    return { application: null, error: 'Pitch must be at least 20 characters.' };
  }
  const { data, error } = await supabase
    .from('scout_applications')
    .insert({
      applicant_id: input.applicantId,
      pitch,
      region: (input.region ?? '').slice(0, 120),
      specialties: input.specialties ?? [],
    })
    .select('*')
    .single();
  if (error) return { application: null, error: error.message };
  // Scout applications still persist and flow through the moderation queue;
  // per the Phase-1 notification strategy we no longer emit a scout
  // notification entry here.
  return { application: data as ScoutApplication, error: null };
}

export async function fetchMyScoutApplication(
  userId: string,
): Promise<ScoutApplication | null> {
  const { data, error } = await supabase
    .from('scout_applications')
    .select('*')
    .eq('applicant_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as ScoutApplication;
}

export async function withdrawScoutApplication(
  id: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('scout_applications')
    .update({ status: 'withdrawn' })
    .eq('id', id);
  if (error) return { error: error.message };
  return { error: null };
}

// ─── Admin moderation helpers ──────────────────────────────────────────────
//
// All three rely on the existing RLS:
//   * scout_apps_update_admin policy (USING/WITH CHECK public.is_admin())
//   * guard_scout_application_update trigger (bypassed when is_admin())
//   * apply_scout_verification trigger (AFTER UPDATE OF status → flips
//     profiles.scout_verified server-side, no client write needed).
//
// Non-admin callers will get an RLS error from the UPDATE — surfaced here as
// the returned `error` string. We re-read the row after the write so callers
// can do an immediate optimistic state update without a second round-trip.

async function adminUpdateApplication(
  id: string,
  patch: { status: ScoutApplicationStatus; reviewer_id?: string | null; reviewer_note?: string },
): Promise<{ application: ScoutApplication | null; error: string | null }> {
  const { data, error } = await supabase
    .from('scout_applications')
    .update(patch)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) return { application: null, error: error.message };
  if (!data) return { application: null, error: 'Application not found or not permitted.' };
  return { application: data as ScoutApplication, error: null };
}

export async function approveScoutApplication(
  applicationId: string,
  opts?: { reviewerId?: string | null; note?: string },
): Promise<{ application: ScoutApplication | null; error: string | null }> {
  const result = await adminUpdateApplication(applicationId, {
    status: 'approved',
    reviewer_id: opts?.reviewerId ?? null,
    reviewer_note: opts?.note ?? '',
  });
  // Approval still flips the Verified Scout badge server-side (via the
  // apply_scout_verification trigger). Per the Phase-1 notification strategy
  // we no longer emit a scout notification entry here.
  return result;
}

export async function rejectScoutApplication(
  applicationId: string,
  opts?: { reviewerId?: string | null; note?: string },
): Promise<{ application: ScoutApplication | null; error: string | null }> {
  const result = await adminUpdateApplication(applicationId, {
    status: 'declined',
    reviewer_id: opts?.reviewerId ?? null,
    reviewer_note: opts?.note ?? '',
  });
  // Per the Phase-1 notification strategy we no longer emit a scout
  // notification entry here; the application status update still persists.
  return result;
}

// Revoke an already-granted Verified Scout badge by flipping the latest
// approved application back to 'declined'. The apply_scout_verification
// trigger then sets profiles.scout_verified = false atomically.
//
// We deliberately do NOT fall back to a direct profiles.update — the
// prevent_profile_field_escalation trigger blocks privileged column
// changes from JWT-originated calls, so that path silently no-ops.
// Legacy direct-grant accounts (no application row) require a SECURITY
// DEFINER RPC, which is on the moderation roadmap.
export async function revokeScoutVerification(
  userId: string,
  opts?: { reviewerId?: string | null; note?: string },
): Promise<{ error: string | null }> {
  const { data: approved, error: fetchErr } = await supabase
    .from('scout_applications')
    .select('id')
    .eq('applicant_id', userId)
    .eq('status', 'approved')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fetchErr) return { error: fetchErr.message };
  if (!approved?.id) {
    return {
      error:
        'No approved scout_applications row for this user. Direct-grant revokes require a server-side admin RPC (not yet implemented).',
    };
  }
  const { error } = await adminUpdateApplication(approved.id, {
    status: 'declined',
    reviewer_id: opts?.reviewerId ?? null,
    reviewer_note: opts?.note ?? 'Verification revoked',
  });
  return { error };
}
