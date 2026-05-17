import { useState } from 'react';
import {
  Search, Plus, MapPin, DollarSign, Star, ListFilter as Filter,
  ArrowLeft, Camera, Sparkles, TrendingUp, Clock, User, ChevronRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { GuestBlurOverlay } from '../components/GuestGate';

type ViewState = 'feed' | 'create' | 'matches';

const CATEGORIES = [
  'Watches', 'Jewelry', 'Furniture', 'Antiques', 'Sneakers',
  'Toys', 'Collectibles', 'Tools', 'Electronics', 'Art', 'Books', 'Other',
];

const CONDITIONS = ['Mint', 'Good', 'Fair', 'Parts/Repair'];

interface SearchRequest {
  id: string;
  title: string;
  category: string;
  condition: string;
  budgetMin: string;
  budgetMax: string;
  notes: string;
  username: string;
  timePosted: string;
  scouts: number;
  image: string;
  urgency: 'low' | 'medium' | 'high';
}

const feedItems: SearchRequest[] = [
  {
    id: '1',
    title: 'Eames Lounge Chair (Original)',
    category: 'Furniture',
    condition: 'Good',
    budgetMin: '2000',
    budgetMax: '4000',
    notes: 'Looking for authentic Herman Miller with rosewood shell. No reproductions.',
    username: 'vintage_hunter',
    timePosted: '2h ago',
    scouts: 14,
    image: 'https://images.pexels.com/photos/1350789/pexels-photo-1350789.jpeg?auto=compress&cs=tinysrgb&w=300',
    urgency: 'high',
  },
  {
    id: '2',
    title: 'Nintendo 64 Complete Set',
    category: 'Electronics',
    condition: 'Good',
    budgetMin: '150',
    budgetMax: '300',
    notes: 'Need controllers, cables, and at least 5 games. GoldenEye preferred.',
    username: 'retro_gamer',
    timePosted: '5h ago',
    scouts: 8,
    image: 'https://images.pexels.com/photos/371924/pexels-photo-371924.jpeg?auto=compress&cs=tinysrgb&w=300',
    urgency: 'medium',
  },
  {
    id: '3',
    title: 'Vintage Pyrex Mixing Bowls',
    category: 'Collectibles',
    condition: 'Mint',
    budgetMin: '50',
    budgetMax: '150',
    notes: 'Primary colors set preferred. Will consider individual pieces.',
    username: 'kitchen_collector',
    timePosted: '1d ago',
    scouts: 22,
    image: 'https://images.pexels.com/photos/5825573/pexels-photo-5825573.jpeg?auto=compress&cs=tinysrgb&w=300',
    urgency: 'low',
  },
  {
    id: '4',
    title: 'Rolex Submariner Pre-2010',
    category: 'Watches',
    condition: 'Good',
    budgetMin: '6000',
    budgetMax: '9000',
    notes: 'Looking for no-date variant. Box and papers preferred but not required.',
    username: 'watch_seeker',
    timePosted: '3h ago',
    scouts: 31,
    image: 'https://images.pexels.com/photos/190819/pexels-photo-190819.jpeg?auto=compress&cs=tinysrgb&w=300',
    urgency: 'high',
  },
  {
    id: '5',
    title: 'Air Jordan 1 Chicago (1985)',
    category: 'Sneakers',
    condition: 'Fair',
    budgetMin: '800',
    budgetMax: '2000',
    notes: 'Wearable condition acceptable. Size 10-10.5 only.',
    username: 'sole_hunter',
    timePosted: '6h ago',
    scouts: 19,
    image: 'https://images.pexels.com/photos/1464625/pexels-photo-1464625.jpeg?auto=compress&cs=tinysrgb&w=300',
    urgency: 'medium',
  },
];

const trendingSearches = [
  { label: 'Mid-Century Furniture', count: 142 },
  { label: 'Vintage Watches', count: 98 },
  { label: 'Retro Gaming', count: 76 },
  { label: 'First Edition Books', count: 54 },
];

const suggestedMatches = [
  {
    id: '1',
    title: 'Herman Miller Eames Chair - Walnut',
    price: '$3,200',
    source: 'Estate Sale - Brooklyn',
    matchScore: 94,
    image: 'https://images.pexels.com/photos/1350789/pexels-photo-1350789.jpeg?auto=compress&cs=tinysrgb&w=200',
  },
  {
    id: '2',
    title: 'N64 Console + 8 Games Bundle',
    price: '$220',
    source: 'Garage Sale - Austin',
    matchScore: 87,
    image: 'https://images.pexels.com/photos/371924/pexels-photo-371924.jpeg?auto=compress&cs=tinysrgb&w=200',
  },
  {
    id: '3',
    title: 'Pyrex Primary Colors Set (Complete)',
    price: '$95',
    source: 'Thrift Store - Portland',
    matchScore: 91,
    image: 'https://images.pexels.com/photos/5825573/pexels-photo-5825573.jpeg?auto=compress&cs=tinysrgb&w=200',
  },
];

const urgencyColors = {
  low: { bg: 'var(--color-secondary-50)', text: 'var(--color-secondary-700)' },
  medium: { bg: 'var(--color-warning-50)', text: 'var(--color-warning-600)' },
  high: { bg: 'var(--color-error-50)', text: 'var(--color-error-600)' },
};

export default function RareRadar() {
  const { isGuest } = useAuth();
  const [view, setView] = useState<ViewState>('feed');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  if (isGuest) {
    return (
      <GuestBlurOverlay
        title="Unlock Rare Radar"
        subtitle="AI-powered treasure matching that alerts you when rare items appear near you."
      >
        <FeedView
          selectedCategory={null}
          setSelectedCategory={() => {}}
          onCreateRequest={() => {}}
          onViewMatches={() => {}}
        />
      </GuestBlurOverlay>
    );
  }

  if (view === 'create') {
    return <CreateRequest onBack={() => setView('feed')} />;
  }

  if (view === 'matches') {
    return <MatchesView onBack={() => setView('feed')} />;
  }

  return (
    <FeedView
      selectedCategory={selectedCategory}
      setSelectedCategory={setSelectedCategory}
      onCreateRequest={() => setView('create')}
      onViewMatches={() => setView('matches')}
    />
  );
}

function FeedView({
  selectedCategory,
  setSelectedCategory,
  onCreateRequest,
  onViewMatches,
}: {
  selectedCategory: string | null;
  setSelectedCategory: (c: string | null) => void;
  onCreateRequest: () => void;
  onViewMatches: () => void;
}) {
  const filteredItems = selectedCategory
    ? feedItems.filter((i) => i.category === selectedCategory)
    : feedItems;

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerTop}>
          <div>
            <h1 style={styles.title}>Rare Radar</h1>
            <p style={styles.subtitle}>What are you hunting for?</p>
          </div>
          <button onClick={onViewMatches} style={styles.matchesBtn}>
            <Sparkles size={16} style={{ color: 'var(--color-primary-600)' }} />
            <span style={styles.matchesBtnText}>Matches</span>
          </button>
        </div>
        <div style={styles.searchBar}>
          <Search size={18} style={{ color: 'var(--color-neutral-400)' }} />
          <input
            type="text"
            placeholder="Search wanted items..."
            style={styles.searchInput}
            readOnly
          />
          <button style={styles.filterIcon}>
            <Filter size={16} style={{ color: 'var(--color-neutral-500)' }} />
          </button>
        </div>
      </header>

      <div style={styles.content}>
        <div style={styles.categoriesScroll}>
          <button
            onClick={() => setSelectedCategory(null)}
            style={{
              ...styles.catChip,
              ...(selectedCategory === null ? styles.catChipActive : {}),
            }}
          >
            All
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
              style={{
                ...styles.catChip,
                ...(selectedCategory === cat ? styles.catChipActive : {}),
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        <button onClick={onCreateRequest} style={styles.postButton}>
          <Plus size={20} style={{ color: 'var(--color-neutral-0)' }} />
          <span style={styles.postButtonText}>Post What You're Looking For</span>
        </button>

        <div style={styles.sectionRow}>
          <h3 style={styles.sectionTitle}>Active Hunts</h3>
          <span style={styles.count}>{filteredItems.length} requests</span>
        </div>

        <div style={styles.feedList}>
          {filteredItems.map((item, index) => (
            <article
              key={item.id}
              style={{
                ...styles.feedCard,
                animationDelay: `${index * 80}ms`,
              }}
            >
              <div style={styles.feedCardTop}>
                <img src={item.image} alt={item.title} style={styles.feedCardImage} />
                <div style={styles.feedCardInfo}>
                  <h3 style={styles.feedCardTitle}>{item.title}</h3>
                  <div style={styles.feedCardMeta}>
                    <span style={styles.feedCardCategory}>{item.category}</span>
                    <span
                      style={{
                        ...styles.urgencyBadge,
                        backgroundColor: urgencyColors[item.urgency].bg,
                        color: urgencyColors[item.urgency].text,
                      }}
                    >
                      {item.urgency}
                    </span>
                  </div>
                  <div style={styles.feedCardDetails}>
                    <span style={styles.feedCardBudget}>
                      <DollarSign size={12} /> ${item.budgetMin} - ${item.budgetMax}
                    </span>
                    <span style={styles.feedCardCondition}>
                      <Star size={12} /> {item.condition}
                    </span>
                  </div>
                </div>
              </div>

              {item.notes && <p style={styles.feedCardNotes}>{item.notes}</p>}

              <div style={styles.feedCardFooter}>
                <div style={styles.feedCardUser}>
                  <div style={styles.userAvatar}>
                    <User size={12} style={{ color: 'var(--color-neutral-400)' }} />
                  </div>
                  <span style={styles.userName}>@{item.username}</span>
                  <span style={styles.timePosted}>
                    <Clock size={10} /> {item.timePosted}
                  </span>
                </div>
                <button style={styles.scoutBtn}>
                  <span>Scout This</span>
                </button>
              </div>

              <div style={styles.scoutCountRow}>
                <span style={styles.scoutCount}>{item.scouts} scouts watching</span>
              </div>
            </article>
          ))}
        </div>

        <div style={styles.trendingSection}>
          <div style={styles.sectionRow}>
            <div style={styles.trendingHeader}>
              <TrendingUp size={16} style={{ color: 'var(--color-primary-500)' }} />
              <h3 style={styles.sectionTitle}>Trending Searches</h3>
            </div>
          </div>
          <div style={styles.trendingList}>
            {trendingSearches.map((item) => (
              <div key={item.label} style={styles.trendingItem}>
                <span style={styles.trendingLabel}>{item.label}</span>
                <span style={styles.trendingCount}>{item.count} hunters</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateRequest({ onBack }: { onBack: () => void }) {
  const [form, setForm] = useState({
    title: '',
    category: '',
    condition: '',
    budgetMin: '',
    budgetMax: '',
    notes: '',
    location: '',
  });
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div style={styles.container}>
        <div style={styles.successContent}>
          <div style={styles.successIcon}>
            <Sparkles size={36} style={{ color: 'var(--color-primary-500)' }} />
          </div>
          <h2 style={styles.successTitle}>Hunt Posted!</h2>
          <p style={styles.successSubtitle}>
            Scouts in your area will be notified. You'll get alerts when matches are found.
          </p>
          <div style={styles.successCard}>
            <h3 style={styles.successCardTitle}>{form.title || 'Your Item'}</h3>
            <div style={styles.successCardMeta}>
              {form.category && <span style={styles.successTag}>{form.category}</span>}
              {form.condition && <span style={styles.successTag}>{form.condition}</span>}
            </div>
            {form.budgetMin && form.budgetMax && (
              <p style={styles.successBudget}>${form.budgetMin} - ${form.budgetMax}</p>
            )}
          </div>
          <div style={styles.successActions}>
            <button onClick={onBack} style={styles.viewFeedBtn}>View in Feed</button>
            <button
              onClick={() => {
                setForm({ title: '', category: '', condition: '', budgetMin: '', budgetMax: '', notes: '', location: '' });
                setSubmitted(false);
              }}
              style={styles.postAnotherBtn}
            >
              <Plus size={16} style={{ color: 'var(--color-neutral-0)' }} />
              <span style={{ color: 'var(--color-neutral-0)' }}>Post Another</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.stepHeader}>
        <button onClick={onBack} style={styles.backBtn}>
          <ArrowLeft size={20} />
        </button>
        <span style={styles.stepLabel}>Create Search Request</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={styles.createContent}>
        <div style={styles.createFields}>
          <div style={styles.field}>
            <label style={styles.fieldLabel}>What are you looking for?</label>
            <input
              type="text"
              placeholder="e.g. Vintage Rolex Submariner"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              style={styles.input}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Category</label>
            <div style={styles.chipGrid}>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setForm({ ...form, category: cat })}
                  style={{
                    ...styles.selectChip,
                    ...(form.category === cat ? styles.selectChipActive : {}),
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Preferred Condition</label>
            <div style={styles.conditionRow}>
              {CONDITIONS.map((cond) => (
                <button
                  key={cond}
                  onClick={() => setForm({ ...form, condition: cond })}
                  style={{
                    ...styles.conditionChip,
                    ...(form.condition === cond ? styles.conditionChipActive : {}),
                  }}
                >
                  {cond}
                </button>
              ))}
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Budget Range</label>
            <div style={styles.budgetRow}>
              <div style={styles.budgetInputWrap}>
                <DollarSign size={14} style={{ color: 'var(--color-neutral-400)' }} />
                <input
                  type="text"
                  placeholder="Min"
                  value={form.budgetMin}
                  onChange={(e) => setForm({ ...form, budgetMin: e.target.value })}
                  style={styles.budgetInput}
                />
              </div>
              <span style={styles.budgetDash}>-</span>
              <div style={styles.budgetInputWrap}>
                <DollarSign size={14} style={{ color: 'var(--color-neutral-400)' }} />
                <input
                  type="text"
                  placeholder="Max"
                  value={form.budgetMax}
                  onChange={(e) => setForm({ ...form, budgetMax: e.target.value })}
                  style={styles.budgetInput}
                />
              </div>
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Reference Photo (optional)</label>
            <div style={styles.photoUpload}>
              <Camera size={24} style={{ color: 'var(--color-neutral-300)' }} />
              <span style={styles.photoUploadText}>Tap to add reference image</span>
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Location Preference (optional)</label>
            <div style={styles.locationWrap}>
              <MapPin size={16} style={{ color: 'var(--color-neutral-400)' }} />
              <input
                type="text"
                placeholder="City, region, or 'anywhere'"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                style={styles.locationInput}
              />
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Notes for Scouts (optional)</label>
            <textarea
              placeholder="Any specific details, markings, or variations you prefer..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              style={styles.textarea}
              rows={3}
            />
          </div>
        </div>

        <button onClick={() => setSubmitted(true)} style={styles.submitBtn}>
          <Search size={18} style={{ color: 'var(--color-neutral-0)' }} />
          <span style={styles.submitBtnText}>Start the Hunt</span>
        </button>
      </div>
    </div>
  );
}

function MatchesView({ onBack }: { onBack: () => void }) {
  return (
    <div style={styles.container}>
      <header style={styles.stepHeader}>
        <button onClick={onBack} style={styles.backBtn}>
          <ArrowLeft size={20} />
        </button>
        <span style={styles.stepLabel}>Possible Matches</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={styles.matchesContent}>
        <div style={styles.matchesHeader}>
          <div style={styles.matchesIconCircle}>
            <Sparkles size={24} style={{ color: 'var(--color-primary-500)' }} />
          </div>
          <h2 style={styles.matchesTitle}>AI Match Suggestions</h2>
          <p style={styles.matchesSubtitle}>Based on your active hunts and similar finds</p>
        </div>

        <div style={styles.matchesList}>
          {suggestedMatches.map((match, index) => (
            <div
              key={match.id}
              style={{
                ...styles.matchCard,
                animationDelay: `${index * 100}ms`,
              }}
            >
              <img src={match.image} alt={match.title} style={styles.matchImage} />
              <div style={styles.matchInfo}>
                <h3 style={styles.matchTitle}>{match.title}</h3>
                <span style={styles.matchPrice}>{match.price}</span>
                <span style={styles.matchSource}>
                  <MapPin size={10} /> {match.source}
                </span>
              </div>
              <div style={styles.matchScoreBadge}>
                <span style={styles.matchScoreText}>{match.matchScore}%</span>
                <span style={styles.matchScoreLabel}>match</span>
              </div>
            </div>
          ))}
        </div>

        <div style={styles.similarSection}>
          <div style={styles.sectionRow}>
            <h3 style={styles.sectionTitle}>Similar Finds Nearby</h3>
            <ChevronRight size={16} style={{ color: 'var(--color-neutral-400)' }} />
          </div>
          <div style={styles.similarGrid}>
            <div style={styles.similarCard}>
              <img
                src="https://images.pexels.com/photos/190819/pexels-photo-190819.jpeg?auto=compress&cs=tinysrgb&w=200"
                alt="Similar item"
                style={styles.similarImage}
              />
              <span style={styles.similarPrice}>$4,500</span>
            </div>
            <div style={styles.similarCard}>
              <img
                src="https://images.pexels.com/photos/1350789/pexels-photo-1350789.jpeg?auto=compress&cs=tinysrgb&w=200"
                alt="Similar item"
                style={styles.similarImage}
              />
              <span style={styles.similarPrice}>$2,800</span>
            </div>
            <div style={styles.similarCard}>
              <img
                src="https://images.pexels.com/photos/1464625/pexels-photo-1464625.jpeg?auto=compress&cs=tinysrgb&w=200"
                alt="Similar item"
                style={styles.similarImage}
              />
              <span style={styles.similarPrice}>$1,200</span>
            </div>
          </div>
        </div>

        <div style={styles.trendingMatchSection}>
          <div style={styles.sectionRow}>
            <div style={styles.trendingHeader}>
              <TrendingUp size={14} style={{ color: 'var(--color-primary-500)' }} />
              <h3 style={styles.sectionTitle}>Hot Right Now</h3>
            </div>
          </div>
          <div style={styles.hotList}>
            <div style={styles.hotItem}>
              <span style={styles.hotRank}>1</span>
              <span style={styles.hotLabel}>Vintage Omega Seamaster</span>
              <span style={styles.hotCount}>47 scouts</span>
            </div>
            <div style={styles.hotItem}>
              <span style={styles.hotRank}>2</span>
              <span style={styles.hotLabel}>MCM Teak Credenza</span>
              <span style={styles.hotCount}>38 scouts</span>
            </div>
            <div style={styles.hotItem}>
              <span style={styles.hotRank}>3</span>
              <span style={styles.hotLabel}>Air Jordan 4 Bred (2019)</span>
              <span style={styles.hotCount}>33 scouts</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    backgroundColor: 'var(--color-neutral-0)',
  },
  header: {
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-neutral-0)',
    borderBottom: '1px solid var(--color-neutral-100)',
    flexShrink: 0,
  },
  headerTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-3)',
  },
  title: {
    fontSize: 'var(--font-size-xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  subtitle: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-500)',
    marginTop: '2px',
  },
  matchesBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-50)',
    border: '1px solid var(--color-primary-200)',
  },
  matchesBtnText: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-primary-700)',
  },
  searchBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-4)',
    backgroundColor: 'var(--color-neutral-50)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
  },
  searchInput: {
    flex: 1,
    backgroundColor: 'transparent',
    color: 'var(--color-neutral-900)',
    fontSize: 'var(--font-size-sm)',
  },
  filterIcon: {
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: 'var(--space-4)',
  },
  categoriesScroll: {
    display: 'flex',
    gap: 'var(--space-2)',
    overflow: 'auto',
    paddingBottom: 'var(--space-3)',
    marginBottom: 'var(--space-4)',
  },
  catChip: {
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    backgroundColor: 'var(--color-neutral-100)',
    color: 'var(--color-neutral-600)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    border: '1px solid transparent',
    transition: 'all var(--transition-fast)',
  },
  catChipActive: {
    backgroundColor: 'var(--color-neutral-900)',
    color: 'var(--color-neutral-0)',
  },
  postButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    width: '100%',
    padding: 'var(--space-4)',
    borderRadius: 'var(--radius-md)',
    background: 'linear-gradient(135deg, var(--color-secondary-500), var(--color-secondary-600))',
    marginBottom: 'var(--space-5)',
    boxShadow: '0 4px 12px rgba(20, 184, 166, 0.3)',
  },
  postButtonText: {
    color: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
  },
  sectionRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-3)',
  },
  sectionTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
  },
  count: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
  },
  feedList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-6)',
  },
  feedCard: {
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-100)',
    boxShadow: 'var(--shadow-sm)',
    animation: 'slideUp 0.4s ease forwards',
    opacity: 0,
    animationFillMode: 'forwards',
  },
  feedCardTop: {
    display: 'flex',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-3)',
  },
  feedCardImage: {
    width: '64px',
    height: '64px',
    borderRadius: 'var(--radius-sm)',
    objectFit: 'cover',
    flexShrink: 0,
  },
  feedCardInfo: {
    flex: 1,
    minWidth: 0,
  },
  feedCardTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
    lineHeight: 'var(--line-height-tight)',
    marginBottom: '4px',
  },
  feedCardMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginBottom: '4px',
  },
  feedCardCategory: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  urgencyBadge: {
    fontSize: '10px',
    fontWeight: 'var(--font-weight-semibold)',
    padding: '2px 8px',
    borderRadius: 'var(--radius-full)',
    textTransform: 'capitalize',
  },
  feedCardDetails: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },
  feedCardBudget: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-success-600)',
  },
  feedCardCondition: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  feedCardNotes: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
    lineHeight: 'var(--line-height-normal)',
    marginBottom: 'var(--space-3)',
  },
  feedCardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  feedCardUser: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },
  userAvatar: {
    width: '20px',
    height: '20px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-100)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-700)',
  },
  timePosted: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
  },
  scoutBtn: {
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-0)',
  },
  scoutCountRow: {
    marginTop: 'var(--space-2)',
    paddingTop: 'var(--space-2)',
    borderTop: '1px solid var(--color-neutral-50)',
  },
  scoutCount: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
  },
  trendingSection: {
    marginBottom: 'var(--space-4)',
  },
  trendingHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },
  trendingList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  trendingItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-3) var(--space-4)',
    backgroundColor: 'var(--color-neutral-50)',
    borderRadius: 'var(--radius-sm)',
  },
  trendingLabel: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-700)',
  },
  trendingCount: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
  },

  // Step header
  stepHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4)',
    borderBottom: '1px solid var(--color-neutral-100)',
    flexShrink: 0,
  },
  backBtn: {
    width: '36px',
    height: '36px',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-neutral-600)',
  },
  stepLabel: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
  },

  // Create form
  createContent: {
    flex: 1,
    overflow: 'auto',
    padding: 'var(--space-4)',
    display: 'flex',
    flexDirection: 'column',
  },
  createFields: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-5)',
    flex: 1,
    marginBottom: 'var(--space-4)',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  fieldLabel: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-700)',
  },
  input: {
    padding: 'var(--space-3) var(--space-4)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-neutral-50)',
    border: '1px solid var(--color-neutral-200)',
    fontSize: 'var(--font-size-base)',
    color: 'var(--color-neutral-900)',
    width: '100%',
  },
  chipGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-2)',
  },
  selectChip: {
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    backgroundColor: 'var(--color-neutral-100)',
    color: 'var(--color-neutral-600)',
    border: '1px solid transparent',
    transition: 'all var(--transition-fast)',
  },
  selectChipActive: {
    backgroundColor: 'var(--color-primary-50)',
    color: 'var(--color-primary-700)',
    border: '1px solid var(--color-primary-200)',
  },
  conditionRow: {
    display: 'flex',
    gap: 'var(--space-2)',
    flexWrap: 'wrap',
  },
  conditionChip: {
    flex: '1 0 auto',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    backgroundColor: 'var(--color-neutral-50)',
    color: 'var(--color-neutral-600)',
    border: '1px solid var(--color-neutral-200)',
    textAlign: 'center',
    transition: 'all var(--transition-fast)',
  },
  conditionChipActive: {
    backgroundColor: 'var(--color-secondary-50)',
    color: 'var(--color-secondary-700)',
    border: '1px solid var(--color-secondary-200)',
  },
  budgetRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },
  budgetInputWrap: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-neutral-50)',
    border: '1px solid var(--color-neutral-200)',
  },
  budgetInput: {
    flex: 1,
    fontSize: 'var(--font-size-base)',
    color: 'var(--color-neutral-900)',
    backgroundColor: 'transparent',
    width: '100%',
  },
  budgetDash: {
    color: 'var(--color-neutral-400)',
    fontWeight: 'var(--font-weight-medium)',
  },
  photoUpload: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-6)',
    borderRadius: 'var(--radius-md)',
    border: '2px dashed var(--color-neutral-200)',
    backgroundColor: 'var(--color-neutral-50)',
  },
  photoUploadText: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-400)',
  },
  locationWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-4)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-neutral-50)',
    border: '1px solid var(--color-neutral-200)',
  },
  locationInput: {
    flex: 1,
    fontSize: 'var(--font-size-base)',
    color: 'var(--color-neutral-900)',
    backgroundColor: 'transparent',
  },
  textarea: {
    padding: 'var(--space-3) var(--space-4)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-neutral-50)',
    border: '1px solid var(--color-neutral-200)',
    fontSize: 'var(--font-size-base)',
    color: 'var(--color-neutral-900)',
    lineHeight: 'var(--line-height-normal)',
    resize: 'none',
    width: '100%',
  },
  submitBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    width: '100%',
    padding: 'var(--space-4)',
    borderRadius: 'var(--radius-md)',
    background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-accent-500))',
    boxShadow: '0 4px 16px rgba(234, 179, 8, 0.3)',
    flexShrink: 0,
  },
  submitBtnText: {
    color: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-semibold)',
  },

  // Success
  successContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-6)',
    textAlign: 'center',
  },
  successIcon: {
    width: '72px',
    height: '72px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-50)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 'var(--space-4)',
    animation: 'scaleIn 0.4s ease',
  },
  successTitle: {
    fontSize: 'var(--font-size-2xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
    marginBottom: 'var(--space-2)',
  },
  successSubtitle: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-500)',
    marginBottom: 'var(--space-6)',
    maxWidth: '260px',
  },
  successCard: {
    width: '100%',
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-neutral-50)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
    marginBottom: 'var(--space-6)',
    textAlign: 'left',
  },
  successCardTitle: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
    marginBottom: 'var(--space-2)',
  },
  successCardMeta: {
    display: 'flex',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-2)',
  },
  successTag: {
    fontSize: 'var(--font-size-xs)',
    padding: '2px 8px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-secondary-50)',
    color: 'var(--color-secondary-700)',
  },
  successBudget: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-success-600)',
  },
  successActions: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  viewFeedBtn: {
    width: '100%',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-700)',
    textAlign: 'center',
  },
  postAnotherBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    width: '100%',
    padding: 'var(--space-4)',
    borderRadius: 'var(--radius-md)',
    background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-accent-500))',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    boxShadow: '0 4px 16px rgba(234, 179, 8, 0.3)',
  },

  // Matches view
  matchesContent: {
    flex: 1,
    overflow: 'auto',
    padding: 'var(--space-4)',
  },
  matchesHeader: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    marginBottom: 'var(--space-5)',
  },
  matchesIconCircle: {
    width: '52px',
    height: '52px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-50)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 'var(--space-3)',
  },
  matchesTitle: {
    fontSize: 'var(--font-size-lg)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  matchesSubtitle: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-500)',
    marginTop: '2px',
  },
  matchesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-6)',
  },
  matchCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-100)',
    backgroundColor: 'var(--color-neutral-0)',
    boxShadow: 'var(--shadow-sm)',
    animation: 'slideUp 0.4s ease forwards',
    opacity: 0,
    animationFillMode: 'forwards',
  },
  matchImage: {
    width: '56px',
    height: '56px',
    borderRadius: 'var(--radius-sm)',
    objectFit: 'cover',
    flexShrink: 0,
  },
  matchInfo: {
    flex: 1,
    minWidth: 0,
  },
  matchTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
    lineHeight: 'var(--line-height-tight)',
    marginBottom: '2px',
  },
  matchPrice: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-success-600)',
    display: 'block',
    marginBottom: '2px',
  },
  matchSource: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
  },
  matchScoreBadge: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-primary-50)',
    borderRadius: 'var(--radius-md)',
    flexShrink: 0,
  },
  matchScoreText: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-primary-700)',
  },
  matchScoreLabel: {
    fontSize: '10px',
    color: 'var(--color-primary-500)',
    textTransform: 'uppercase',
  },
  similarSection: {
    marginBottom: 'var(--space-6)',
  },
  similarGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 'var(--space-2)',
  },
  similarCard: {
    position: 'relative',
    aspectRatio: '1',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
  },
  similarImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  similarPrice: {
    position: 'absolute',
    bottom: 'var(--space-2)',
    left: 'var(--space-2)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-0)',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: '2px 8px',
    borderRadius: 'var(--radius-sm)',
  },
  trendingMatchSection: {
    marginBottom: 'var(--space-4)',
  },
  hotList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  hotItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) var(--space-4)',
    backgroundColor: 'var(--color-neutral-50)',
    borderRadius: 'var(--radius-sm)',
  },
  hotRank: {
    width: '22px',
    height: '22px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-100)',
    color: 'var(--color-primary-700)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-bold)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  hotLabel: {
    flex: 1,
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-700)',
  },
  hotCount: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
  },
};
