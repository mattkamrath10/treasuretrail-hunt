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

// Native push is currently disabled: the @capacitor-firebase/messaging plugin is
// intentionally NOT installed, so it is never compiled into the native build (it
// crashes iOS on launch without a GoogleService-Info.plist). Importing via a
// variable specifier + @vite-ignore keeps the web build from trying to resolve
// the absent module; on a native device the import simply throws and is caught,
// making push a clean no-op. Re-add the package to turn push back on.
const PUSH_PLUGIN = '@capacitor-firebase/messaging';

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
    const { FirebaseMessaging } = await import(/* @vite-ignore */ PUSH_PLUGIN);

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
      await FirebaseMessaging.addListener('notificationActionPerformed', (event: { notification?: { data?: Record<string, unknown> } }) => {
        const data = (event?.notification?.data ?? {}) as Record<string, unknown>;
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
    const { FirebaseMessaging } = await import(/* @vite-ignore */ PUSH_PLUGIN);
    await FirebaseMessaging.deleteToken();
    lastToken = null;
  } catch (err) {
    console.warn('[PUSH] removal failed', err);
  }
}
