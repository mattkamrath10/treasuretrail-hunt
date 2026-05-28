import { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
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
  '/u/', '/profile/',
  '/event/',
  '/wanted/',
  '/find/',
  '/listing/',
];
function isPublicSharePath(pathname: string): boolean {
  return PUBLIC_SHARE_PREFIXES.some((p) => pathname.startsWith(p));
}

function AppContent() {
  const { user, loading, hasCompletedSetup, isGuest, enterGuestMode } = useAuth();
  const [hasOnboarded, setHasOnboarded] = useState(() => {
    return localStorage.getItem('tt_onboarded') === 'true';
  });
  const [authView, setAuthView] = useState<'login' | 'signup'>('login');

  const completeOnboarding = () => {
    localStorage.setItem('tt_onboarded', 'true');
    setHasOnboarded(true);
  };

  // Public deep links bypass onboarding + login entirely. Without this,
  // a cold tap on /wanted/:id or /u/:handle from Messages dumps the
  // visitor on the onboarding splash instead of the linked content.
  const publicShare = typeof window !== 'undefined' && isPublicSharePath(window.location.pathname);
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
    if (authView === 'login') {
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
