import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { supabaseConfigMissing } from './lib/supabase';
import './styles/index.css';

// Router selection is platform-driven:
//   * Web  → BrowserRouter: clean URLs, share links like /listing/:id resolve
//            via the host's SPA fallback (public/_redirects + dist/404.html).
//   * Native (Capacitor) → HashRouter: the webview serves bundled files from
//            capacitor://localhost (iOS) / http://localhost (Android) with NO
//            server-side fallback, so deep routes / reloads to /event/:id would
//            404. Hash routes (/#/event/:id) always resolve to index.html.
// This keeps web behaviour identical while making native routing reliable.
const Router = Capacitor.isNativePlatform() ? HashRouter : BrowserRouter;

const rootElement = document.getElementById('root')!;

// A native build that shipped without its Supabase keys would otherwise launch
// to a silent blank/white screen. Render a readable message instead so the
// cause is visible on-device (where there is no developer console to inspect).
function renderStartupError(title: string, detail: string): void {
  rootElement.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0b0b0c;color:#f5f5f5;text-align:center;">
      <div style="max-width:420px;">
        <h1 style="font-size:20px;margin:0 0 12px;">${title}</h1>
        <p style="font-size:15px;line-height:1.5;color:#b9b9bd;margin:0;">${detail}</p>
      </div>
    </div>`;
}

try {
  if (supabaseConfigMissing) {
    renderStartupError(
      'App configuration missing',
      "This build is missing its database connection settings (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY). Add them to the build environment and rebuild.",
    );
  } else {
    createRoot(rootElement).render(
      <StrictMode>
        <ErrorBoundary>
          <Router>
            <App />
          </Router>
        </ErrorBoundary>
      </StrictMode>
    );
  }
} catch (err) {
  renderStartupError(
    'The app failed to start',
    err instanceof Error ? err.message : String(err),
  );
}
