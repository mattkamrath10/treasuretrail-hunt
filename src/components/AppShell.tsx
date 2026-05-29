import { lazy, Suspense, useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import BottomNav from './BottomNav';
import OfflineBanner from './OfflineBanner';
import { useAuth } from '../context/AuthContext';
import { readPendingIntent, clearPendingIntent } from '../lib/pendingIntent';
import { getOrCreateConversation } from '../lib/messaging';

// Route-level code splitting — each page becomes its own chunk so the
// initial bundle only includes Home + the shell. Other pages stream in
// on first navigation. Vite content-hashes the chunks, so cache busting
// after a republish is automatic.
const Discover = lazy(() => import('../pages/Discover'));
const Home = lazy(() => import('../pages/Home'));
const FlashFinds = lazy(() => import('../pages/FlashFinds'));
const Sell = lazy(() => import('../pages/Sell'));
const Wanted = lazy(() => import('../pages/Wanted'));
const WantedDetail = lazy(() => import('../pages/WantedDetail'));
const WantedForm = lazy(() => import('../pages/WantedForm'));
const RareRadar = lazy(() => import('../pages/RareRadar'));
const Alerts = lazy(() => import('../pages/Alerts'));
const Profile = lazy(() => import('../pages/Profile'));
const Auctions = lazy(() => import('../pages/Auctions'));
const Messages = lazy(() => import('../pages/Messages'));
const Achievements = lazy(() => import('../pages/Achievements'));
const Marketplace = lazy(() => import('../pages/Marketplace'));
const Pro = lazy(() => import('../pages/Pro'));
const Safety = lazy(() => import('../pages/Safety'));
const Community = lazy(() => import('../pages/Community'));
const Events = lazy(() => import('../pages/Events'));
const LiveHub = lazy(() => import('../pages/LiveHub'));
const SellerDashboard = lazy(() => import('../pages/SellerDashboard'));
const SellerEventForm = lazy(() => import('../pages/SellerEventForm'));
const EventDetail = lazy(() => import('../pages/EventDetail'));
const FindDetail = lazy(() => import('../pages/FindDetail'));
const ListingDetail = lazy(() => import('../pages/ListingDetail'));
const PublicProfile = lazy(() => import('../pages/PublicProfile'));

function AuctionsPage() {
  const navigate = useNavigate();
  return <Auctions onBack={() => navigate('/')} />;
}

function MessagesPage() {
  const navigate = useNavigate();
  // Single component handles both `/messages` (inbox) and `/messages/:id`
  // (chat) — it branches on useParams() internally.
  return <Messages onBack={() => navigate('/alerts')} />;
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

function SellPage() {
  const navigate = useNavigate();
  return <Sell onBack={() => navigate('/')} />;
}

function WantedPage() {
  const navigate = useNavigate();
  return <Wanted onBack={() => navigate('/')} />;
}

function WantedFormPage() {
  const navigate = useNavigate();
  return <WantedForm onBack={() => navigate('/sell')} />;
}

function LiveHubPage() {
  const navigate = useNavigate();
  return <LiveHub onBack={() => navigate('/')} />;
}

function SellerDashboardPage() {
  const navigate = useNavigate();
  return <SellerDashboard onBack={() => navigate('/events')} />;
}

function SellerEventFormPage() {
  const navigate = useNavigate();
  return <SellerEventForm onBack={() => navigate('/seller')} />;
}

function EventDetailPage() {
  const navigate = useNavigate();
  return <EventDetail onBack={() => navigate('/events')} />;
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

/**
 * Resume a pre-auth pending intent once the user becomes authenticated.
 *
 * Flow: an unauth visitor on a public share page (e.g. /wanted/:id) taps
 * "Message Requester" → we stash a PendingIntent in sessionStorage and
 * bounce them to Login. After they sign in, App.tsx re-renders AppShell
 * with `user` truthy; this hook fires the deferred action (open or
 * create the DM thread, then navigate) and clears the intent.
 *
 * The ref guard prevents a double-execute if React re-runs the effect
 * during the same auth flip.
 */
function useResumePendingIntent() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const handledRef = useRef(false);

  useEffect(() => {
    if (!user || handledRef.current) return;
    const intent = readPendingIntent();
    if (!intent) return;
    handledRef.current = true;
    clearPendingIntent();

    (async () => {
      if (intent.kind === 'message_requester') {
        // Owner of the wanted item somehow ended up with this intent (e.g.
        // signed in as the same account that posted it) — bail to the
        // wanted page instead of trying to message themselves.
        if (intent.requesterId === user.id) {
          navigate(`/wanted/${intent.wantedId}`, { replace: true });
          return;
        }
        const { conversationId, error } = await getOrCreateConversation({
          otherUserId: intent.requesterId,
        });
        if (error || !conversationId) {
          // Couldn't open chat — drop them back on the wanted page so the
          // CTA is still there to retry.
          navigate(`/wanted/${intent.wantedId}`, { replace: true });
          return;
        }
        navigate(`/messages/${conversationId}`, {
          replace: true,
          state: intent.prefill ? { prefill: intent.prefill } : undefined,
        });
      } else if (intent.kind === 'boost_event') {
        // Reopen Live Events with the boost picker auto-shown. LiveHub reads
        // `location.state.openBoost` on mount to pop the BoostPickerModal.
        navigate('/live', { replace: true, state: { openBoost: true } });
      }
    })();
  }, [user, navigate]);
}

export default function AppShell() {
  useResumePendingIntent();
  return (
    <div style={styles.container}>
      <OfflineBanner />
      <div style={styles.content}>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Discover />} />
            <Route path="/home" element={<Home />} />
            <Route path="/flash-finds" element={<FlashFinds />} />
            <Route path="/sell" element={<SellPage />} />
            <Route path="/sell/wanted" element={<WantedFormPage />} />
            <Route path="/wanted" element={<WantedPage />} />
            <Route path="/wanted/:id" element={<WantedDetail />} />
            <Route path="/rare-radar" element={<RareRadar />} />
            <Route path="/auctions" element={<AuctionsPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            {/* Dedicated chat view for a single conversation. Same Messages
                component branches on useParams() to render the chat UI. */}
            <Route path="/messages/:id" element={<MessagesPage />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/marketplace" element={<MarketplacePage />} />
            <Route path="/pro" element={<ProPage />} />
            <Route path="/safety" element={<SafetyPage />} />
            <Route path="/community" element={<CommunityPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/seller" element={<SellerDashboardPage />} />
            <Route path="/seller/new" element={<SellerEventFormPage />} />
            <Route path="/seller/event/:id" element={<SellerEventFormPage />} />
            <Route path="/event/:id" element={<EventDetailPage />} />
            <Route path="/live" element={<LiveHubPage />} />
            <Route path="/achievements" element={<AchievementsPage />} />
            <Route path="/profile" element={<Profile />} />
            {/* Public profile by username — the existing /u/:username route in App.tsx is
                kept as an alias; /profile/:username is the canonical link surfaced from
                feed cards and the Find Detail page. */}
            <Route path="/profile/:username" element={<PublicProfile />} />
            {/* Legacy/share alias — kept so older shared links like
                tt.app/u/alice continue to resolve. Mounted inside
                AppShell (and therefore AuthProvider) so deep-linked
                visitors don't crash on useAuth(). */}
            <Route path="/u/:username" element={<PublicProfile />} />
            {/* Dedicated detail page for a community_post (Flash Find, Rare Radar,
                auction-win, etc.). Replaces the prior in-feed modal so links are
                shareable, deep-linkable, and survive page refresh. */}
            <Route path="/find/:id" element={<FindDetail />} />
            {/* Dedicated detail page for a marketplace_listings row. Mirrors
                /find/:id and is the canonical share/deep-link target for any
                marketplace card. Replaces the prior in-feed modal. */}
            <Route path="/listing/:id" element={<ListingDetail />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </div>
      <BottomNav />
    </div>
  );
}
