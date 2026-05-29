/**
 * Resolve the API base URL.
 *
 * On the web the app is served by the same origin that proxies `/api` to the
 * Express server (see vite.config.ts), so a relative path works. Inside a
 * native Capacitor shell the webview loads bundled assets from
 * `capacitor://localhost` / `https://localhost`, so relative `/api` calls would
 * never reach the backend — they need an absolute URL to the deployed server.
 *
 * Set `VITE_API_BASE` (e.g. https://your-app.replit.app) for native builds.
 * Leave it unset for web (relative paths + Vite proxy).
 */
const RAW_BASE = (import.meta.env.VITE_API_BASE ?? '').trim();
const BASE = RAW_BASE.replace(/\/+$/, '');

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return BASE ? `${BASE}${p}` : p;
}
