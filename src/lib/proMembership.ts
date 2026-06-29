import { apiUrl } from './apiBase';
import { supabase } from './supabase';

/**
 * Admin-only: grant or revoke a Pro membership for a user. The server
 * re-checks admin role; this just carries the caller's bearer token. Returns
 * nothing on success and throws with a readable message on failure.
 */
export async function setProMembership(args: {
  userId: string;
  action: 'grant' | 'revoke';
}): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('You must be signed in.');

  const res = await fetch(apiUrl('/api/admin/pro'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(args),
  });

  if (!res.ok) {
    let msg = 'Could not update Pro membership.';
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* ignore parse errors */
    }
    throw new Error(msg);
  }
}
