import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { AuthProvider, useAuth } from './context/AuthContext';
import Onboarding from './pages/Onboarding';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import ProfileSetup from './pages/ProfileSetup';
import AppShell from './components/AppShell';
import { readPendingIntent } from './lib/pendingIntent';

// Shared deep links (DMs, social, search) must render the destination
// page on cold load without forcing Onboarding/Login. We detect public
// share paths from the URL and render AppShell directly — every page
// listed here already tolerates a null `user` and handles its own
// "Sign in to …" prompts for write actions.
const PUBLIC_SHARE_PREFIXES = [
  '/seo-preview',
  '/ca/',
  '/category/',
  '/u/', '/profile/',
  '/event/',
  '/wanted/',
  '/find/',
  '/listing/',
  // Legal pages must be reachable without an account so the App Store /
  // Play Store listing URLs and in-review reviewers can open them directly.
  '/privacy',
  '/terms',
];
const PRIVATE_SELLER_PREFIXES = [
  '/seller/analytics',
  '/seller/demand',
  '/seller/new',
  '/seller/event',
];
function isPublicSharePath(pathname: string): boolean {
  if (pathname.startsWith('/seller/')) {
    // Match on whole path segments so a public handle that merely *starts*
    // with a private word (e.g. `/seller/new-deals`) is not wrongly gated.
    return !PRIVATE_SELLER_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(p + '/'),
    );
  }
  return PUBLIC_SHARE_PREFIXES.some((p) => pathname.startsWith(p));
}

// Resolve the active route path regardless of router type. On web
// (BrowserRouter) the route lives in `pathname`; inside the native shell
// (HashRouter) it lives in the hash as `#/event/:id`. Reading the wrong one
// would make cold-load public-share detection miss on native.
function currentRoutePath(): string {
  if (typeof window === 'undefined') return '/';
  // Only the native shell uses HashRouter, so only there does the route live in
  // the hash. On web, always trust pathname so a stray `/#/...` URL can't trip
  // the public-share bypass.
  if (Capacitor.isNativePlatform()) {
    const hash = window.location.hash;
    if (hash.startsWith('#/')) return hash.slice(1);
  }
  return window.location.pathname;
}

function AppContent() {
  const { user, loading, hasCompletedSetup, isGuest, enterGuestMode } = useAuth();
  const [hasOnboarded, setHasOnboarded] = useState(() => {
    return localStorage.getItem('tt_onboarded') === 'true';
  });
  const [authView, setAuthView] = useState<'login' | 'signup'>('login');

  // When a guest taps an account-gated action (e.g. Create Event), the
  // AccountRequired screen stashes which auth view it wants ('signup' vs
  // 'login') and calls exitGuestMode(). Pick that up here so "Sign Up"
  // lands on SignUp instead of always defaulting to Login.
  useEffect(() => {
    if (user || isGuest) return;
    try {
      const v = sessionStorage.getItem('tt_auth_view');
      if (v === 'signup' || v === 'login') {
        setAuthView(v);
        sessionStorage.removeItem('tt_auth_view');
      }
    } catch {}
  }, [user, isGuest]);

  const completeOnboarding = () => {
    localStorage.setItem('tt_onboarded', 'true');
    setHasOnboarded(true);
  };

  // Public deep links bypass onboarding + login entirely. Without this,
  // a cold tap on /wanted/:id or /u/:handle from Messages dumps the
  // visitor on the onboarding splash instead of the linked content.
  const publicShare = isPublicSharePath(currentRoutePath());
  if (publicShare && !loading) {
    return (
      <Routes>
        <Route path="/*" element={<AppShell />} />
      </Routes>
    );
  }

  // A pending post-auth intent (e.g. "Message Requester" from a cold deep
  // link on /wanted/:id) must skip the onboarding splash and go straight
  // to Login/SignUp so the user can finish the action they just started.
  // Without this, navigate('/') from WantedDetail would land first-time
  // visitors on Onboarding and the intent would feel abandoned.
  const hasPendingIntent = typeof window !== 'undefined' && !!readPendingIntent();

  if (!hasOnboarded && !hasPendingIntent) {
    return <Onboarding onComplete={completeOnboarding} />;
  }

  if (loading) {
    return <LoadingScreen />;
  }

  if (isGuest) {
    return (
      <Routes>
        <Route path="/*" element={<AppShell />} />
      </Routes>
    );
  }

  if (!user) {
    // Honor a one-shot auth view stashed by AccountRequired (guest tapped
    // "Sign Up"/"Log In"). Read it synchronously here so SignUp shows on
    // the first frame — no Login flash. The effect above clears the key
    // and syncs state so later in-screen toggles still work.
    let view = authView;
    try {
      const stashed = sessionStorage.getItem('tt_auth_view');
      if (stashed === 'signup' || stashed === 'login') view = stashed;
    } catch {}
    if (view === 'login') {
      return <Login onSwitchToSignUp={() => setAuthView('signup')} onGuestBrowse={enterGuestMode} />;
    }
    return <SignUp onSwitchToLogin={() => setAuthView('login')} onGuestBrowse={enterGuestMode} />;
  }

  if (!hasCompletedSetup) {
    return <ProfileSetup />;
  }

  return (
    <Routes>
      <Route path="/*" element={<AppShell />} />
    </Routes>
  );
}

function LoadingScreen() {
  return (
    <div style={loadingStyles.container}>
      <h1 style={loadingStyles.logo}>TreasureTrail</h1>
      <div style={loadingStyles.spinner} />
    </div>
  );
}

const loadingStyles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-6)',
    backgroundColor: 'var(--color-neutral-0)',
  },
  logo: {
    fontSize: 'var(--font-size-2xl)',
    fontWeight: 'var(--font-weight-bold)',
    background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-accent-500))',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  spinner: {
    width: '24px',
    height: '24px',
    borderRadius: 'var(--radius-full)',
    border: '3px solid var(--color-neutral-200)',
    borderTopColor: 'var(--color-primary-500)',
    animation: 'spin 0.8s linear infinite',
  },
};

export default function App() {
  // Note: every route — including share aliases like /u/:username — runs
  // inside AuthProvider. Routing PublicProfile outside the provider
  // would crash deep-linked visitors because useAuth() throws when
  // there is no surrounding provider. The /u/:username alias is
  // mounted inside AppShell alongside the canonical /profile/:username.
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
