import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Plus, MapPin, DollarSign, Star, ListFilter as Filter,
  ArrowLeft, Camera, Sparkles, Clock, User, X, Home as HomeIcon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { GuestBlurOverlay } from '../components/GuestGate';
import { ImageWithFade } from '../components/ui/ImageWithFade';
import { MediaFallback } from '../components/ui/MediaFallback';
import { createCommunityPost, fetchCommunityPosts } from '../lib/database';
import { useLiveFeed } from '../hooks/useLiveFeed';
import {
  getRareRadarDrafts,
  clearRareRadarDraft,
  type RareRadarDraft,
} from '../lib/itemIntelligence';

type ViewState = 'create' | 'success' | 'feed' | 'matches';

const CATEGORIES = [
  'Watches', 'Jewelry', 'Furniture', 'Antiques', 'Sneakers',
  'Toys', 'Collectibles', 'Tools', 'Electronics', 'Art', 'Books', 'Other',
];

const CONDITIONS = ['Mint', 'Good', 'Fair', 'Parts/Repair'];

interface SearchRequest {
  id: string;
  title: string;
  category: string;
  conditions: string[];
  budgetMin: string;
  budgetMax: string;
  notes: string;
  location: string;
  image: string;
  username: string;
  timePosted: string;
  urgency: 'low' | 'medium' | 'high';
}

function conditionKeyToLabel(key: 'mint' | 'good' | 'fair' | 'parts'): string {
  switch (key) {
    case 'mint':  return 'Mint';
    case 'good':  return 'Good';
    case 'fair':  return 'Fair';
    case 'parts': return 'Parts/Repair';
  }
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'just now';
  const diff = Math.max(0, Date.now() - then);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const urgencyColors = {
  low: { bg: 'var(--color-secondary-50)', text: 'var(--color-secondary-700)' },
  medium: { bg: 'var(--color-warning-50)', text: 'var(--color-warning-600)' },
  high: { bg: 'var(--color-error-50)', text: 'var(--color-error-600)' },
};

export default function RareRadar() {
  const { isGuest } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<ViewState>('create');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [hunts, setHunts] = useState<SearchRequest[]>([]);
  const [lastHunt, setLastHunt] = useState<SearchRequest | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Hydrate already-posted Rare Radar requests from Supabase so the feed
  // persists across sessions and matches what shows on Home Feed.
  // The polled caller (useLiveFeed) needs failures to propagate so its
  // exponential backoff engages; the mount caller catches separately.
  const hydrateHunts = useCallback(() => {
    return fetchCommunityPosts(50)
      .then((posts) => {
        const radarPosts = posts.filter((p) => p.type === 'rare_radar');
        if (radarPosts.length === 0) return;
        const mapped: SearchRequest[] = radarPosts.map((p) => ({
          id: p.id,
          title: p.caption || 'Untitled hunt',
          category: p.category || '',
          conditions: ((p as unknown as { tags?: string[] }).tags ?? []).filter((t) =>
            CONDITIONS.includes(t),
          ),
          budgetMin: '',
          budgetMax: p.estimated_value != null ? String(p.estimated_value) : '',
          notes: '',
          location: p.location || '',
          image: p.image_url || '',
          username: p.profiles?.username || 'hunter',
          timePosted: formatRelative(p.created_at),
          urgency: 'medium',
        }));
        setHunts((prev) => {
          const known = new Set(prev.map((h) => h.id));
          return [...mapped.filter((m) => !known.has(m.id)), ...prev];
        });
      });
  }, []);

  useEffect(() => { hydrateHunts().catch(() => {}); }, [hydrateHunts]);

  // Live refresh — silently re-pull every 10s and merge any new hunts
  // (de-duped by id) without disturbing existing state, filters, or scroll.
  // hydrateHunts intentionally rethrows so useLiveFeed can back off.
  useLiveFeed(hydrateHunts, true);

  // Hydrate drafts that were shared from Flash Finds → AI Analysis.
  useEffect(() => {
    const drafts = getRareRadarDrafts();
    if (drafts.length === 0) return;
    const fromDrafts: SearchRequest[] = drafts.map((d: RareRadarDraft) => ({
      id: d.id,
      title: d.title,
      category: d.category,
      conditions: d.condition ? [conditionKeyToLabel(d.condition)] : [],
      budgetMin: d.budgetLow !== null ? String(d.budgetLow) : '',
      budgetMax: d.budgetHigh !== null ? String(d.budgetHigh) : '',
      notes: d.notes,
      location: '',
      image: d.imageUrl ?? '',
      username: 'you',
      timePosted: formatRelative(d.createdAt),
      urgency: 'medium',
    }));
    setHunts((prev) => {
      const known = new Set(prev.map((h) => h.id));
      return [...fromDrafts.filter((d) => !known.has(d.id)), ...prev];
    });
    // Drafts are now in component state; clear the localStorage queue so we
    // don't re-add duplicates on every remount.
    drafts.forEach((d) => clearRareRadarDraft(d.id));
  }, []);

  if (isGuest) {
    return (
      <GuestBlurOverlay
        title="Unlock Rare Radar"
        subtitle="Post what you're searching for and let the community help you find it."
      >
        <CreateRequest
          onPosted={() => {}}
          onViewMatches={() => {}}
          onViewFeed={() => {}}
          huntCount={0}
        />
      </GuestBlurOverlay>
    );
  }

  const handlePosted = (hunt: SearchRequest) => {
    // CreateRequest has already persisted to Supabase and replaced the local
    // hunt id with the DB row id. Just hydrate UI state.
    setHunts((prev) => [hunt, ...prev.filter((h) => h.id !== hunt.id)]);
    setLastHunt(hunt);
    setHighlightId(hunt.id);
    setView('success');
  };

  if (view === 'matches') {
    return <MatchesView onBack={() => setView('create')} />;
  }

  if (view === 'feed') {
    return (
      <FeedView
        hunts={hunts}
        highlightId={highlightId}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        onCreateRequest={() => setView('create')}
        onViewMatches={() => setView('matches')}
        onClearHighlight={() => setHighlightId(null)}
      />
    );
  }

  if (view === 'success' && lastHunt) {
    return (
      <SuccessView
        hunt={lastHunt}
        onViewFeed={() => {
          setSelectedCategory(null);
          setHighlightId(lastHunt.id);
          setView('feed');
        }}
        onViewHomeFeed={() => {
          navigate('/', { state: { highlightPostId: lastHunt.id } });
        }}
        onPostAnother={() => setView('create')}
      />
    );
  }

  return (
    <CreateRequest
      onPosted={handlePosted}
      onViewMatches={() => setView('matches')}
      onViewFeed={() => setView('feed')}
      huntCount={hunts.length}
    />
  );
}

function FeedView({
  hunts,
  highlightId,
  selectedCategory,
  setSelectedCategory,
  onCreateRequest,
  onViewMatches,
  onClearHighlight,
}: {
  hunts: SearchRequest[];
  highlightId: string | null;
  selectedCategory: string | null;
  setSelectedCategory: (c: string | null) => void;
  onCreateRequest: () => void;
  onViewMatches: () => void;
  onClearHighlight?: () => void;
}) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const highlightRef = useRef<HTMLElement | null>(null);

  const feedItems = hunts;

  const filteredItems = feedItems.filter((i) => {
    const matchesCategory = selectedCategory ? i.category === selectedCategory : true;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch = q
      ? i.title.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q) ||
        (i.notes && i.notes.toLowerCase().includes(q))
      : true;
    return matchesCategory && matchesSearch;
  });

  const highlightedItemVisible = highlightId
    ? filteredItems.some((i) => i.id === highlightId)
    : false;
  const highlightedHunt = highlightId
    ? feedItems.find((i) => i.id === highlightId) ?? null
    : null;

  useEffect(() => {
    if (highlightId && highlightedItemVisible && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const t = setTimeout(() => onClearHighlight?.(), 3500);
      return () => clearTimeout(t);
    }
  }, [highlightId, highlightedItemVisible, onClearHighlight]);

  const handleResetForHighlight = () => {
    setSearchQuery('');
    setSelectedCategory(null);
  };

  const hasActiveSearch = searchQuery.trim().length > 0 || selectedCategory !== null;

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
          <Search size={18} style={{ color: searchQuery ? 'var(--color-primary-500)' : 'var(--color-neutral-400)' }} />
          <input
            type="text"
            placeholder="Search In Search Of items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchInput}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {searchQuery.length > 0 && (
            <button
              onClick={() => setSearchQuery('')}
              style={styles.clearBtn}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
          <button
            onClick={() => setSelectedCategory(selectedCategory ? null : 'Watches')}
            style={styles.filterIcon}
            aria-label="Toggle category filter"
            title="Toggle category filter"
          >
            <Filter size={16} style={{ color: selectedCategory ? 'var(--color-primary-600)' : 'var(--color-neutral-500)' }} />
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

        {highlightId && highlightedHunt && !highlightedItemVisible && (
          <div style={styles.highlightBanner} role="status">
            <span style={styles.highlightBannerText}>
              Your new hunt "<strong>{highlightedHunt.title}</strong>" is hidden by your current filters.
            </span>
            <button onClick={handleResetForHighlight} style={styles.highlightBannerBtn}>
              Show it
            </button>
          </div>
        )}

        <div style={styles.sectionRow}>
          <h3 style={styles.sectionTitle}>Active Hunts</h3>
          <span style={styles.count}>{filteredItems.length} requests</span>
        </div>

        {feedItems.length === 0 && !hasActiveSearch && (
          <div style={styles.emptyState}>
            <Search size={32} style={{ color: 'var(--color-neutral-300)', marginBottom: 12 }} />
            <p style={styles.emptyTitle}>No active hunts yet</p>
            <p style={styles.emptySub}>Be the first — post what you're looking for and sellers will reach out.</p>
          </div>
        )}

        {feedItems.length > 0 && filteredItems.length === 0 && hasActiveSearch && (
          <div style={styles.emptyState}>
            <Search size={32} style={{ color: 'var(--color-neutral-300)', marginBottom: 12 }} />
            <p style={styles.emptyTitle}>No results found</p>
            <p style={styles.emptySub}>
              {searchQuery ? `No hunts match "${searchQuery}"` : 'No hunts in this category yet.'}
              {' '}Try a different search or clear the filter.
            </p>
            {hasActiveSearch && (
              <button
                onClick={() => { setSearchQuery(''); setSelectedCategory(null); }}
                style={styles.clearFilterBtn}
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        <div style={styles.feedList}>
          {filteredItems.map((item, index) => {
            const isHighlighted = item.id === highlightId;
            return (
            <article
              key={item.id}
              ref={(el) => { if (isHighlighted) highlightRef.current = el; }}
              style={{
                ...styles.feedCard,
                animationDelay: `${index * 80}ms`,
                ...(isHighlighted ? {
                  outline: '2px solid var(--color-primary-500)',
                  boxShadow: '0 0 0 4px rgba(234, 179, 8, 0.15), var(--shadow-md)',
                } : {}),
              }}
            >
              <div style={styles.feedCardTop}>
                <div style={styles.feedCardImage}>
                  <ImageWithFade
                    src={item.image}
                    alt={item.title}
                    fallback={
                      <MediaFallback
                        kind="wanted"
                        category={item.category}
                        seed={item.id}
                        label="WANTED"
                        compact
                      />
                    }
                  />
                </div>
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
                    {(item.budgetMin || item.budgetMax) && (
                      <span style={styles.feedCardBudget}>
                        <DollarSign size={12} /> ${item.budgetMin || '0'} - ${item.budgetMax || '—'}
                      </span>
                    )}
                    {item.conditions.length > 0 && (
                      <span style={styles.feedCardCondition}>
                        <Star size={12} /> {item.conditions.join(', ')}
                      </span>
                    )}
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
                <button
                  onClick={() => navigate('/messages')}
                  style={styles.haveItBtn}
                  aria-label={`Message about ${item.title}`}
                >
                  <span>I Have This</span>
                </button>
              </div>
            </article>
          );
          })}
        </div>

      </div>
    </div>
  );
}

const PLACEHOLDER_IMG = 'https://images.pexels.com/photos/1670766/pexels-photo-1670766.jpeg?auto=compress&cs=tinysrgb&w=400';

function CreateRequest({
  onPosted,
  onViewMatches,
  onViewFeed,
  huntCount,
}: {
  onPosted: (hunt: SearchRequest) => void;
  onViewMatches: () => void;
  onViewFeed: () => void;
  huntCount: number;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    title: '',
    category: '',
    conditions: [] as string[],
    budgetMin: '',
    budgetMax: '',
    notes: '',
    location: '',
  });
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleCondition = useCallback((cond: string) => {
    setForm((prev) => ({
      ...prev,
      conditions: prev.conditions.includes(cond)
        ? prev.conditions.filter((c) => c !== cond)
        : [...prev.conditions, cond],
    }));
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('Image is too large (max 8 MB).');
      return;
    }
    setError('');
    const reader = new FileReader();
    reader.onload = () => setPhotoUrl(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(file);
  };

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.title.trim()) { setError('Tell us what you\'re hunting for.'); return; }
    if (!form.category) { setError('Pick a category.'); return; }
    const min = form.budgetMin ? parseFloat(form.budgetMin) : NaN;
    const max = form.budgetMax ? parseFloat(form.budgetMax) : NaN;
    if (form.budgetMin && form.budgetMax && !isNaN(min) && !isNaN(max) && min > max) {
      setError('Min budget can\'t be more than max.');
      return;
    }
    if (!user?.id) { setError('Please sign in to post a hunt.'); return; }

    const username = (user.user_metadata as { username?: string } | undefined)?.username
      || user.email?.split('@')[0]
      || 'you';

    setSubmitting(true);

    // Persist to Supabase so the hunt shows up in both Home Feed and
    // Rare Radar feed (and survives reloads).
    const budgetForDb =
      !isNaN(max) ? max : !isNaN(min) ? min : undefined;
    const noteParts = [
      form.notes.trim(),
      form.budgetMin || form.budgetMax
        ? `Budget: $${form.budgetMin || '0'} - $${form.budgetMax || '—'}`
        : '',
    ].filter(Boolean);

    const { data: created, error: dbErr } = await createCommunityPost({
      user_id: user.id,
      type: 'rare_radar',
      caption: form.title.trim(),
      image_url: photoUrl || undefined,
      tags: form.conditions,
      location: form.location.trim() || undefined,
      general_location: form.location.trim() || undefined,
      category: form.category,
      estimated_value: budgetForDb,
      scout_needed: true,
    });
    setSubmitting(false);
    if (dbErr || !created) {
      setError(dbErr || 'Could not post your hunt. Please try again.');
      return;
    }

    const hunt: SearchRequest = {
      id: created.id,
      title: form.title.trim(),
      category: form.category,
      conditions: form.conditions,
      budgetMin: form.budgetMin.trim(),
      budgetMax: form.budgetMax.trim(),
      notes: noteParts.join(' • '),
      location: form.location.trim(),
      image: photoUrl || PLACEHOLDER_IMG,
      username,
      timePosted: 'just now',
      urgency: 'medium',
    };
    onPosted(hunt);
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerTop}>
          <div>
            <h1 style={styles.title}>Rare Radar</h1>
            <p style={styles.subtitle}>Post what you're searching for and let the community help you find it.</p>
          </div>
          <button onClick={onViewMatches} style={styles.matchesBtn} aria-label="View matches">
            <Sparkles size={16} style={{ color: 'var(--color-primary-600)' }} />
            <span style={styles.matchesBtnText}>Matches</span>
          </button>
        </div>
        {huntCount > 0 && (
          <button onClick={onViewFeed} style={styles.feedLinkBtn}>
            <Search size={14} style={{ color: 'var(--color-primary-600)' }} />
            <span>View {huntCount} active hunt{huntCount === 1 ? '' : 's'}</span>
          </button>
        )}
      </header>

      <form onSubmit={handleSubmit} style={styles.createContent}>
        <div style={styles.createFields}>
          <div style={styles.field}>
            <label style={styles.fieldLabel}>What are you looking for?</label>
            <input
              type="text"
              placeholder="e.g. Vintage Rolex Submariner"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              style={styles.input}
              autoCapitalize="words"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Category</label>
            <div style={styles.chipGrid}>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
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
            <label style={styles.fieldLabel}>
              Preferred Condition <span style={styles.fieldHint}>(pick any)</span>
            </label>
            <div style={styles.conditionRow}>
              {CONDITIONS.map((cond) => {
                const active = form.conditions.includes(cond);
                return (
                  <button
                    key={cond}
                    type="button"
                    onClick={() => toggleCondition(cond)}
                    aria-pressed={active}
                    style={{
                      ...styles.conditionChip,
                      ...(active ? styles.conditionChipActive : {}),
                    }}
                  >
                    {active && <span style={styles.condCheck} aria-hidden>✓</span>}
                    {cond}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Budget Range</label>
            <div style={styles.budgetRow}>
              <div style={styles.budgetInputWrap}>
                <DollarSign size={14} style={{ color: 'var(--color-neutral-400)' }} />
                <input
                  type="text"
                  inputMode="decimal"
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
                  inputMode="decimal"
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
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            {photoUrl ? (
              <div style={styles.photoPreviewWrap}>
                <ImageWithFade
                  src={photoUrl}
                  alt="Reference preview"
                  style={styles.photoPreview}
                  fallback={<MediaFallback kind="wanted" seed={photoUrl} label="REF" compact />}
                />
                <button
                  type="button"
                  onClick={() => {
                    setPhotoUrl('');
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  style={styles.photoRemoveBtn}
                  aria-label="Remove reference photo"
                >
                  <X size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={styles.photoReplaceBtn}
                >
                  Replace
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={styles.photoUpload}
              >
                <Camera size={24} style={{ color: 'var(--color-neutral-400)' }} />
                <span style={styles.photoUploadText}>Tap to add reference image</span>
                <span style={styles.photoUploadHint}>From camera roll or take a new photo</span>
              </button>
            )}
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
            <label style={styles.fieldLabel}>Additional Notes (optional)</label>
            <textarea
              placeholder="Any specific details, markings, or variations you prefer..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              style={styles.textarea}
              rows={3}
            />
          </div>

          {error && <p style={styles.errorText} role="alert">{error}</p>}
        </div>

        <button type="submit" style={styles.submitBtn} disabled={submitting}>
          <Search size={18} style={{ color: 'var(--color-neutral-0)' }} />
          <span style={styles.submitBtnText}>
            {submitting ? 'Posting…' : 'Start the Hunt'}
          </span>
        </button>
      </form>
    </div>
  );
}

function SuccessView({
  hunt,
  onViewFeed,
  onViewHomeFeed,
  onPostAnother,
}: {
  hunt: SearchRequest;
  onViewFeed: () => void;
  onViewHomeFeed: () => void;
  onPostAnother: () => void;
}) {
  return (
    <div style={styles.container}>
      <div style={styles.successContent}>
        <div style={styles.successIcon}>
          <Sparkles size={36} style={{ color: 'var(--color-primary-500)' }} />
        </div>
        <h2 style={styles.successTitle}>Your hunt has been posted!</h2>
        <p style={styles.successSubtitle}>
          Sellers in your area will be notified. You'll get alerts when matches are found.
        </p>
        <div style={styles.successCard}>
          {hunt.image && hunt.image !== PLACEHOLDER_IMG && (
            <div style={{ ...styles.successCardImg, overflow: 'hidden' }}>
              <ImageWithFade
                src={hunt.image}
                alt={hunt.title}
                fallback={<MediaFallback kind="wanted" seed={hunt.title} label={hunt.title?.slice(0, 14) || 'WANTED'} compact />}
              />
            </div>
          )}
          <h3 style={styles.successCardTitle}>{hunt.title}</h3>
          <div style={styles.successCardMeta}>
            {hunt.category && <span style={styles.successTag}>{hunt.category}</span>}
            {hunt.conditions.map((c) => (
              <span key={c} style={styles.successTag}>{c}</span>
            ))}
          </div>
          {(hunt.budgetMin || hunt.budgetMax) && (
            <p style={styles.successBudget}>${hunt.budgetMin || '0'} - ${hunt.budgetMax || '—'}</p>
          )}
        </div>
        <div style={styles.successActions}>
          <button
            onClick={onPostAnother}
            style={styles.viewFeedBtn}
          >
            <Plus size={14} style={{ color: 'var(--color-neutral-700)', display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
            Post Another Hunt
          </button>
          <button onClick={onViewFeed} style={styles.viewFeedBtn}>
            <Search size={14} style={{ color: 'var(--color-neutral-700)', display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
            View in Rare Radar
          </button>
          <button onClick={onViewHomeFeed} style={styles.postAnotherBtn}>
            <HomeIcon size={16} style={{ color: 'var(--color-neutral-0)' }} />
            <span style={{ color: 'var(--color-neutral-0)' }}>View in Home Feed</span>
          </button>
        </div>
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

        <div style={{
          padding: 'var(--space-6) var(--space-4)',
          textAlign: 'center',
          color: 'var(--color-neutral-500)',
          fontSize: 'var(--font-size-sm)',
          lineHeight: 1.5,
        }}>
          AI match suggestions arrive here once your hunts get matches.
          Post a hunt to get started.
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
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + var(--space-4))',
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
  clearBtn: {
    width: '20px',
    height: '20px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-300)',
    color: 'var(--color-neutral-0)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    lineHeight: 1,
    flexShrink: 0,
    cursor: 'pointer',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-10) var(--space-4)',
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-700)',
    marginBottom: 'var(--space-2)',
  },
  emptySub: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-500)',
    maxWidth: '280px',
    lineHeight: 'var(--line-height-normal)',
  },
  clearFilterBtn: {
    marginTop: 'var(--space-4)',
    padding: 'var(--space-2) var(--space-4)',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-100)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-700)',
    cursor: 'pointer',
    border: '1px solid var(--color-neutral-200)',
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
  haveItBtn: {
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-0)',
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
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + var(--space-4))',
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
    flex: '1 1 calc(50% - var(--space-2))',
    minHeight: '44px',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
    backgroundColor: 'var(--color-neutral-50)',
    color: 'var(--color-neutral-600)',
    border: '1px solid var(--color-neutral-200)',
    textAlign: 'center',
    transition: 'all var(--transition-fast)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-1)',
  },
  conditionChipActive: {
    backgroundColor: 'var(--color-primary-50)',
    color: 'var(--color-primary-700)',
    border: '1.5px solid var(--color-primary-500)',
    fontWeight: 'var(--font-weight-semibold)',
  },
  condCheck: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-primary-600)',
  },
  fieldHint: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
    fontWeight: 'var(--font-weight-normal)',
    marginLeft: '4px',
  },
  feedLinkBtn: {
    marginTop: 'var(--space-3)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-50)',
    color: 'var(--color-primary-700)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    border: '1px solid var(--color-primary-100)',
  },
  photoPreviewWrap: {
    position: 'relative',
    width: '100%',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
    backgroundColor: 'var(--color-neutral-50)',
    border: '1px solid var(--color-neutral-200)',
  },
  photoPreview: {
    display: 'block',
    width: '100%',
    maxHeight: '260px',
    objectFit: 'cover',
  },
  photoRemoveBtn: {
    position: 'absolute',
    top: 'var(--space-2)',
    right: 'var(--space-2)',
    width: '32px',
    height: '32px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: 'var(--color-neutral-0)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoReplaceBtn: {
    position: 'absolute',
    bottom: 'var(--space-2)',
    right: 'var(--space-2)',
    padding: '6px 12px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
  },
  photoUploadHint: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
  },
  errorText: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-error-600)',
    backgroundColor: 'var(--color-error-50)',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-error-100)',
  },
  highlightBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) var(--space-4)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-primary-50)',
    border: '1px solid var(--color-primary-200)',
    marginBottom: 'var(--space-3)',
  },
  highlightBannerText: {
    flex: 1,
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-primary-700)',
  },
  highlightBannerBtn: {
    padding: '6px 12px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-600)',
    color: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    flexShrink: 0,
  },
  successCardImg: {
    width: '100%',
    maxHeight: '160px',
    objectFit: 'cover',
    borderRadius: 'var(--radius-sm)',
    marginBottom: 'var(--space-3)',
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
