import { apiUrl } from './apiBase';
import { supabase } from './supabase';

/**
 * Admin-only: grant or revoke the "Featured Profile" recognition that pins a
 * member to the top of the Featured Profiles directory. The server re-checks
 * admin role; this just carries the caller's bearer token. Returns nothing on
 * success and throws with a readable message on failure.
 *
 * Mirrors setFoundingPartner — featured_profile is a privileged column guarded
 * at the DB level, so it can only be written through the service-role grant
 * module behind this admin endpoint.
 */
export async function setFeaturedProfile(args: {
  id: string;
  action: 'grant' | 'revoke';
}): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('You must be signed in.');

  const res = await fetch(apiUrl('/api/admin/featured-profile'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(args),
  });

  if (!res.ok) {
    let msg = 'Could not update Featured Profile status.';
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* ignore parse errors */
    }
    throw new Error(msg);
  }
}
