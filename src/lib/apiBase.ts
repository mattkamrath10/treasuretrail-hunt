/**
 * Resolve URLs for the API and the public web app, accounting for the native
 * Capacitor shell.
 *
 * On the web the app is served by the same origin that proxies `/api` to the
 * Express server (see vite.config.ts), so relative paths work. Inside a native
 * Capacitor shell the webview loads bundled assets from `capacitor://localhost`
 * / `http://localhost`, so relative `/api` calls (and `window.location.origin`)
 * never reach the real backend — they need the absolute deployed URL.
 *
 * Two separate absolute URLs are needed for native, because the API server and
 * the public web app are NOT necessarily the same host:
 *   * `VITE_API_BASE`        → deployed Express server that serves `/api/...`.
 *   * `VITE_PUBLIC_WEB_URL`  → deployed web app (for browser-opened links like
 *                              a password-reset redirect). Falls back to
 *                              `VITE_API_BASE` when they share a host.
 * Both are ONLY consulted on native: the web build always uses relative paths /
 * the real origin, so setting them globally is safe and never alters web.
 */
import { Capacitor } from '@capacitor/core';

const RAW_BASE = (import.meta.env.VITE_API_BASE ?? '').trim();
const BASE = RAW_BASE.replace(/\/+$/, '');
const RAW_WEB = (import.meta.env.VITE_PUBLIC_WEB_URL ?? '').trim();
const WEB_BASE = (RAW_WEB || RAW_BASE).replace(/\/+$/, '');

function normalize(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

/**
 * Absolute/relative URL for an `/api/...` call. Web → relative (Vite proxy in
 * dev, same-origin in prod). Native → `VITE_API_BASE` + path (falls back to the
 * relative path if the var is unset, which only happens in a misconfigured
 * native build).
 */
export function apiUrl(path: string): string {
  const p = normalize(path);
  if (!Capacitor.isNativePlatform()) return p;
  return BASE ? `${BASE}${p}` : p;
}

/**
 * Absolute URL to a page of the PUBLIC web app (e.g. for an email link that
 * must open in a browser, like a password-reset redirect). Web → real origin.
 * Native → `VITE_API_BASE` (the deployed https domain that also serves the web
 * app), because `window.location.origin` would be `capacitor://localhost`.
 */
export function publicWebUrl(path: string): string {
  const p = normalize(path);
  const onWeb = typeof window !== 'undefined' && !Capacitor.isNativePlatform();
  if (onWeb) return `${window.location.origin}${p}`;
  if (WEB_BASE) return `${WEB_BASE}${p}`;
  return typeof window !== 'undefined' ? `${window.location.origin}${p}` : p;
}
