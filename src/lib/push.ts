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

function platform(): 'ios' | 'android' | 'web' | 'unknown' {
  const p = Capacitor.getPlatform();
  if (p === 'ios' || p === 'android' || p === 'web') return p;
  return 'unknown';
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
      await FirebaseMessaging.addListener('tokenReceived', (event) => {
        if (event?.token) void upsertToken(event.token);
      });
      await FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
        const data = (event?.notification?.data ?? {}) as Record<string, unknown>;
        const eventId = typeof data.eventId === 'string' ? data.eventId : null;
        if (eventId) {
          // Hash-router-agnostic: let the app pick it up on next navigation.
          try {
            window.location.assign(`/event/${eventId}`);
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
