import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Router>
        <App />
      </Router>
    </ErrorBoundary>
  </StrictMode>
);
