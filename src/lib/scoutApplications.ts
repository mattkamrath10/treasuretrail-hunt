import { supabase } from './supabase';
import { notifyUser } from './notifications';

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
  // Best-effort: notify any admin watchers. We don't have a per-admin
  // target user list here so the V1 notification stays on the applicant
  // (confirmation receipt). Admin-side notifications will land when the
  // moderation queue ships.
  await notifyUser({
    target_user_id: input.applicantId,
    type: 'scout_application',
    title: 'Application received',
    content: 'Your Verified Scout application is being reviewed.',
    related_item_id: data.id,
    related_item_type: 'scout_application',
  }).catch(() => {});
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
