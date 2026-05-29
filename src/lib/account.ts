/**
 * Permanent account deletion (Apple App Store Guideline 5.1.1(v) requirement).
 *
 * The actual delete is performed server-side with the Supabase service-role key
 * (see server `/api/account/delete`). It removes the auth user, and every
 * app table that references `auth.users(id) ON DELETE CASCADE` is wiped
 * automatically by the database — so all associated data goes with the account.
 */
import { supabase } from './supabase';
import { apiUrl } from './apiBase';

export type DeleteAccountResult = { ok: true } | { ok: false; error: string };

export async function deleteAccount(): Promise<DeleteAccountResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: 'You must be signed in to delete your account.' };

  try {
    const res = await fetch(apiUrl('/api/account/delete'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      let msg = 'Account deletion failed. Please try again.';
      try {
        const body = (await res.json()) as { error?: string };
        if (body?.error) msg = body.error;
      } catch {
        /* keep default message */
      }
      return { ok: false, error: msg };
    }

    // Clear the local session so the app drops back to the signed-out state.
    await supabase.auth.signOut();
    return { ok: true };
  } catch {
    return { ok: false, error: 'Network error. Please check your connection and try again.' };
  }
}
