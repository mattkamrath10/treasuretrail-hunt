/**
 * Pending post-auth intents.
 *
 * A user can land on a public share page (e.g. /wanted/:id) without being
 * signed in, tap a write-action CTA ("Message Requester"), and we then need
 * to redirect them through Login/SignUp and *resume the same action* on the
 * other side. Storing the intent in sessionStorage survives the cross-screen
 * navigation but does NOT survive a tab close — that's the right TTL for a
 * "finish what you started" hint.
 *
 * Resume is triggered in AppShell once `user` becomes truthy.
 */

const KEY = 'tt_pending_intent_v1';

export type PendingIntent =
  | {
      kind: 'message_requester';
      wantedId: string;
      requesterId: string;
      prefill?: string;
    }
  | {
      // Logged-out / guest user tapped "Boost Event" on Live Events. After
      // auth we reopen Live Events with the boost picker already showing.
      kind: 'boost_event';
    };

export function setPendingIntent(intent: PendingIntent): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(intent));
  } catch {
    // Private mode / quota — non-fatal; the user will just land on the home
    // page after auth instead of jumping straight into the conversation.
  }
}

export function readPendingIntent(): PendingIntent | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingIntent;
  } catch {
    return null;
  }
}

export function clearPendingIntent(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* noop */ }
}
