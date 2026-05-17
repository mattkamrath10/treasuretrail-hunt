import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import BottomNav from './BottomNav';
import Home from '../pages/Home';
import FlashFinds from '../pages/FlashFinds';
import RareRadar from '../pages/RareRadar';
import Alerts from '../pages/Alerts';
import Profile from '../pages/Profile';
import Auctions from '../pages/Auctions';
import Messages from '../pages/Messages';
import ScoutMap from '../pages/ScoutMap';
import Achievements from '../pages/Achievements';
import Marketplace from '../pages/Marketplace';
import Pro from '../pages/Pro';
import Safety from '../pages/Safety';
import Community from '../pages/Community';
import Events from '../pages/Events';
import LiveHub from '../pages/LiveHub';

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
};

export default function AppShell() {
  return (
    <div style={styles.container}>
      <div style={styles.content}>
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
      </div>
      <BottomNav />
    </div>
  );
}
