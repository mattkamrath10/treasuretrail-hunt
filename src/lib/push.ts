/**
 * Native push registration (iOS/Android via Capacitor + Firebase Cloud Messaging).
 *
 * This module is a NO-OP on the web — all native work is guarded behind
 * `Capacitor.isNativePlatform()` and the heavy plugin is dynamically imported
 * only on a native device, so the web bundle never loads it and the web build
 * is unaffected.
 *
 * Flow on a real device:
 *   1. `registerPush()` asks the OS for notification permission.
 *   2. On grant, it fetches the FCM registration token (a device token, NOT a
 *      phone number) and upserts it into `device_tokens` for the current user.
 *   3. A `tokenReceived` listener keeps the row fresh if the token rotates.
 *   4. `removePush()` (on logout) deletes this device's token row so a signed
 *      out device stops receiving that user's pushes.
 */
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';

let lastToken: string | null = null;
let listenersBound = false;

// Native push is enabled: the @capacitor-firebase/messaging plugin is installed
// and linked into the iOS/Android builds. We load it via a normal dynamic import
// of a LITERAL specifier so Vite bundles it as a lazy chunk that resolves at
// runtime on a real device. The chunk is only ever fetched inside the
// Capacitor.isNativePlatform() guard below, so the web build never loads it.
// (Do NOT switch this back to a variable specifier + @vite-ignore — that leaves
// a bare module name the device webview can't resolve, so the import throws,
// gets swallowed, and push silently no-ops with no permission prompt.)

function platform(): 'ios' | 'android' | 'web' | 'unknown' {
  const p = Capacitor.getPlatform();
  if (p === 'ios' || p === 'android' || p === 'web') return p;
  return 'unknown';
}

/**
 * Map an FCM data payload to an in-app hash route, mirroring the tap targets in
 * the Alerts feed (src/pages/Alerts.tsx). Returns null when there's no specific
 * destination (the app simply opens). go-live uses an `eventId` key; the
 * transactional fan-out uses `{ type, id, relatedType }`.
 */
function routeForPush(data: Record<string, unknown>): string | null {
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const type = str(data.type);
  const id = str(data.id);
  const relatedType = str(data.relatedType);
  const eventId = str(data.eventId);

  if (eventId) return `#/event/${eventId}`;
  if (type === 'go_live' && id) return `#/event/${id}`;
  if (type === 'message' || relatedType === 'message') return '#/messages';
  if (type === 'wanted_post_response' && id) return `#/wanted/${id}`;
  if ((type === 'listing_saved' || type === 'listing_shared') && id) return `#/listing/${id}`;
  return null;
}

async function upsertToken(token: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId || !token) return;
  lastToken = token;
  const { error } = await supabase
    .from('device_tokens')
    .upsert(
      { user_id: userId, token, platform: platform(), last_seen_at: new Date().toISOString() },
      { onConflict: 'token' },
    );
  if (error) console.warn('[PUSH] token upsert failed', error.message);
}

/**
 * Request permission + register for push, and persist the device token.
 * Safe to call on every authenticated app start; no-op on web.
 */
export async function registerPush(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');

    const perm = await FirebaseMessaging.requestPermissions();
    if (perm.receive !== 'granted') {
      console.warn('[PUSH] notification permission not granted');
      return;
    }

    if (!listenersBound) {
      listenersBound = true;
      await FirebaseMessaging.addListener('tokenReceived', (event: { token?: string }) => {
        if (event?.token) void upsertToken(event.token);
      });
      await FirebaseMessaging.addListener('notificationActionPerformed', (event: { notification?: { data?: unknown } }) => {
        const raw = event?.notification?.data;
        const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
        const route = routeForPush(data);
        if (route) {
          // This handler only runs on native (Capacitor), where the app uses
          // HashRouter (see src/main.tsx). Navigating via the hash updates the
          // route in-place (no file request to capacitor://localhost/<path>,
          // which would 404) and HashRouter picks it up on hashchange.
          try {
            window.location.assign(route);
          } catch {
            /* ignore */
          }
        }
      });
    }

    const { token } = await FirebaseMessaging.getToken();
    if (token) await upsertToken(token);
  } catch (err) {
    console.warn('[PUSH] registration failed', err);
  }
}

/** Remove this device's token (call on logout). No-op on web. */
export async function removePush(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const token = lastToken;
    if (token) {
      await supabase.from('device_tokens').delete().eq('token', token);
    }
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
    await FirebaseMessaging.deleteToken();
    lastToken = null;
  } catch (err) {
    console.warn('[PUSH] removal failed', err);
  }
}
