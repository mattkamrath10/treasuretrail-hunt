import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Onboarding from './pages/Onboarding';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import ProfileSetup from './pages/ProfileSetup';
import AppShell from './components/AppShell';

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

  if (!hasOnboarded) {
    return <Onboarding onComplete={completeOnboarding} />;
  }

  if (loading) {
    return <LoadingScreen />;
  }

  if (isGuest) {
    return (
      <Routes>
        <Route path="/*" element={<AppShell />} />
        <Route path="*" element={<Navigate to="/" replace />} />
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
      <Route path="*" element={<Navigate to="/" replace />} />
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
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
