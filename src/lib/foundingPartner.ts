import { apiUrl } from './apiBase';
import { supabase } from './supabase';

/**
 * Admin-only: grant or revoke the Founding Partner badge for a seller
 * (kind 'user') or a business (kind 'business'). The server re-checks admin
 * role; this just carries the caller's bearer token. Returns nothing on
 * success and throws with a readable message on failure.
 */
export async function setFoundingPartner(args: {
  kind: 'user' | 'business';
  id: string;
  action: 'grant' | 'revoke';
}): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('You must be signed in.');

  const res = await fetch(apiUrl('/api/admin/founding-partner'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(args),
  });

  if (!res.ok) {
    let msg = 'Could not update Founding Partner status.';
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* ignore parse errors */
    }
    throw new Error(msg);
  }
}
