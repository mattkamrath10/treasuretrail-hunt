import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import BottomNav from './BottomNav';
import OfflineBanner from './OfflineBanner';

// Route-level code splitting — each page becomes its own chunk so the
// initial bundle only includes Home + the shell. Other pages stream in
// on first navigation. Vite content-hashes the chunks, so cache busting
// after a republish is automatic.
const Home = lazy(() => import('../pages/Home'));
const FlashFinds = lazy(() => import('../pages/FlashFinds'));
const RareRadar = lazy(() => import('../pages/RareRadar'));
const Alerts = lazy(() => import('../pages/Alerts'));
const Profile = lazy(() => import('../pages/Profile'));
const Auctions = lazy(() => import('../pages/Auctions'));
const Messages = lazy(() => import('../pages/Messages'));
const ScoutMap = lazy(() => import('../pages/ScoutMap'));
const Achievements = lazy(() => import('../pages/Achievements'));
const Marketplace = lazy(() => import('../pages/Marketplace'));
const Pro = lazy(() => import('../pages/Pro'));
const Safety = lazy(() => import('../pages/Safety'));
const Community = lazy(() => import('../pages/Community'));
const Events = lazy(() => import('../pages/Events'));
const LiveHub = lazy(() => import('../pages/LiveHub'));

function AuctionsPage() {
  const navigate = useNavigate();
  return <Auctions onBack={() => navigate('/')} />;
}

function MessagesPage() {
  const navigate = useNavigate();
  return <Messages onBack={() => navigate('/alerts')} />;
}

function ScoutMapPage() {
  const navigate = useNavigate();
  return <ScoutMap onBack={() => navigate('/')} />;
}

function AchievementsPage() {
  const navigate = useNavigate();
  return <Achievements onBack={() => navigate('/profile')} />;
}

function MarketplacePage() {
  const navigate = useNavigate();
  return <Marketplace onBack={() => navigate('/')} />;
}

function ProPage() {
  const navigate = useNavigate();
  return <Pro onBack={() => navigate('/')} />;
}

function SafetyPage() {
  const navigate = useNavigate();
  return <Safety onBack={() => navigate('/profile')} />;
}

function CommunityPage() {
  const navigate = useNavigate();
  return <Community onBack={() => navigate('/')} />;
}

function EventsPage() {
  const navigate = useNavigate();
  return <Events onBack={() => navigate('/')} />;
}

function LiveHubPage() {
  const navigate = useNavigate();
  return <LiveHub onBack={() => navigate('/')} />;
}

// Suspense fallback while a route chunk loads. Kept intentionally minimal
// (no skeleton flash) — a calm pulse on a neutral background avoids the
// "blink of white" between routes.
function RouteFallback() {
  return (
    <div style={styles.fallback}>
      <div style={styles.fallbackDot} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    maxWidth: 'var(--max-width)',
    margin: '0 auto',
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    overflow: 'hidden',
  },
  fallback: {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--color-neutral-0)',
  },
  fallbackDot: {
    width: 20,
    height: 20,
    borderRadius: 'var(--radius-full)',
    border: '3px solid var(--color-neutral-200)',
    borderTopColor: 'var(--color-primary-500)',
    animation: 'spin 0.8s linear infinite',
  },
};

export default function AppShell() {
  return (
    <div style={styles.container}>
      <OfflineBanner />
      <div style={styles.content}>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/flash-finds" element={<FlashFinds />} />
            <Route path="/rare-radar" element={<RareRadar />} />
            <Route path="/auctions" element={<AuctionsPage />} />
            <Route path="/scout-map" element={<ScoutMapPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/marketplace" element={<MarketplacePage />} />
            <Route path="/pro" element={<ProPage />} />
            <Route path="/safety" element={<SafetyPage />} />
            <Route path="/community" element={<CommunityPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/live" element={<LiveHubPage />} />
            <Route path="/achievements" element={<AchievementsPage />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </div>
      <BottomNav />
    </div>
  );
}
