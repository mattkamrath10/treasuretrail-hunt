import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Heart, MessageCircle, Bookmark, Share2, Gavel, MapPin, ShoppingBag, Crown, Users, Calendar, Zap, HelpCircle, X, Camera, Brain, Radar, TrendingUp, ChevronRight, ExternalLink, Search, Eye, Trash2, Shield } from 'lucide-react';
import { canDeletePost, deletePost, communityPostToDeletable } from '../lib/moderation';
import NotificationBell from '../components/NotificationBell';
import { checkLocalReminders } from '../lib/localReminders';
import { deriveStatus, statusPriority } from '../lib/eventSchedule';
import { TreasureChestBrand } from '../components/TreasureChestLogo';
import { fetchCommunityPosts, togglePostLike, fetchUserLikes } from '../lib/database';
import { validateFeedItem } from '../lib/flashFindPayload';
import { useLiveFeed } from '../hooks/useLiveFeed';
import { useAuth } from '../context/AuthContext';
import { useGuestAction } from '../components/GuestGate';
import { supabase } from '../lib/supabase';
import { fetchBlockedIds } from '../lib/blocks';
import type { CommunityPost } from '../lib/supabase';
import { SkeletonList } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { Badge, type BadgeVariant } from '../components/ui/Badge';
import { ImageWithFade } from '../components/ui/ImageWithFade';

type FilterId =
  | 'all'
  | 'furniture' | 'watches' | 'jewelry' | 'electronics' | 'collectibles'
  | 'auctions' | 'estate_sales' | 'yard_sales' | 'marketplace'
  | 'rare_radar' | 'flash_finds';

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all',           label: 'All' },
  { id: 'furniture',     label: 'Furniture' },
  { id: 'watches',       label: 'Watches' },
  { id: 'jewelry',       label: 'Jewelry' },
  { id: 'electronics',   label: 'Electronics' },
  { id: 'collectibles',  label: 'Collectibles' },
  { id: 'auctions',      label: 'Auctions' },
  { id: 'estate_sales',  label: 'Estate Sales' },
  { id: 'yard_sales',    label: 'Yard Sales' },
  { id: 'marketplace',   label: 'Marketplace Finds' },
  { id: 'rare_radar',    label: 'Rare Radar Requests' },
  { id: 'flash_finds',   label: 'Flash Finds' },
];

type SortId = 'newest' | 'trending' | 'most_wanted' | 'ending_soon';
const SORTS: { id: SortId; label: string }[] = [
  { id: 'newest',      label: 'Newest' },
  { id: 'trending',    label: 'Trending' },
  { id: 'most_wanted', label: 'Most Wanted' },
  { id: 'ending_soon', label: 'Ending Soon' },
];

interface ExternalListing {
  id: string;
  platform: string;
  listing_type: string;
  external_url: string;
  title: string;
  description?: string | null;
  price_display: string | null;
  category: string | null;
  image_url: string | null;
  start_at: string | null;
  ends_at: string | null;
  scout_needed: boolean;
  ships_available: boolean;
  location?: string | null;
  general_location?: string | null;
  created_at: string;
}

interface MarketplaceListing {
  id: string;
  seller_id: string;
  title: string;
  description: string | null;
  price: number;
  condition: string | null;
  category: string | null;
  image_url: string | null;
  local_pickup: boolean | null;
  shipping_available?: boolean | null;
  general_location?: string | null;
  marketplace_found?: string | null;
  scout_needed?: boolean | null;
  status: string;
  created_at: string;
}

const PLATFORM_COLORS: Record<string, string> = {
  whatnot: '#FF5C00', poshmark: '#C13584', ebay: '#E53238',
  hibid: '#1A3668', maxsold: '#007A74', estatesales: '#7B4F2E',
  facebook: '#1877F2', other: '#6B7280',
};

type ExtendedPost = CommunityPost & {
  general_location?: string | null;
  marketplace_found?: string | null;
  scout_needed?: boolean | null;
};

interface FeedItem {
  kind: 'post' | 'listing' | 'marketplace';
  id: string;
  raw: ExtendedPost | ExternalListing | MarketplaceListing;
  filterIds: Set<FilterId>;
  location: string;
  searchText: string;     // concatenated lowercase text for keyword search
  sortNewest: number;     // ms timestamp
  sortTrending: number;   // engagement score
  sortMostWanted: number; // scout-needed score
  sortEndingSoon: number; // ms until end (Infinity if not an auction)
  sortLivePriority: number; // 0=live, 1=ending_soon, 2=upcoming, 3=open_ended, 4=ended/n-a
}

function categoryToFilterId(cat?: string | null): FilterId | null {
  if (!cat) return null;
  const c = cat.toLowerCase();
  if (c.includes('furniture'))    return 'furniture';
  if (c.includes('watch'))        return 'watches';
  if (c.includes('jewelry'))      return 'jewelry';
  if (c.includes('electronics'))  return 'electronics';
  if (c.includes('collectible'))  return 'collectibles';
  return null;
}

function postTypeFilterId(t: string): FilterId | null {
  if (t === 'rare_radar')                return 'rare_radar';
  if (t === 'flash_find' || t === 'find') return 'flash_finds';
  if (t === 'auction_win')               return 'auctions';
  return null;
}

function listingTypeFilterId(t: string): FilterId | null {
  if (t === 'auction' || t === 'live_stream') return 'auctions';
  if (t === 'estate_sale')                    return 'estate_sales';
  if (t === 'yard_sale' || t === 'garage_sale') return 'yard_sales';
  return 'marketplace';
}

function postBadge(p: ExtendedPost): { label: string; variant: BadgeVariant } | null {
  if (p.type === 'rare_radar')                          return { label: 'Looking For', variant: 'marketplace' };
  if (p.type === 'flash_find' || p.type === 'find')     return { label: 'Found',       variant: 'shipping'    };
  if (p.type === 'auction_win')                          return { label: 'Live Event',  variant: 'event'       };
  return null;
}

function formatMarketplace(raw?: string | null): string {
  if (!raw) return '';
  const map: Record<string, string> = {
    facebook_marketplace: 'Facebook Marketplace',
    craigslist: 'Craigslist',
    offerup: 'OfferUp',
    ebay: 'eBay',
    poshmark: 'Poshmark',
    mercari: 'Mercari',
    nextdoor: 'Nextdoor',
    other: 'Other',
  };
  return map[raw] ?? raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function ImageFallback({ icon: Icon, size = 56 }: { icon: typeof Bookmark; size?: number }) {
  return (
    <div style={{ width: '100%', height: '100%', minHeight: '220px', backgroundColor: 'var(--color-neutral-100)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Icon size={size} style={{ color: 'var(--color-neutral-300)' }} />
    </div>
  );
}

function openExternalUrl(raw: string | null | undefined): void {
  if (!raw) return;
  try {
    const u = new URL(raw, window.location.origin);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
    window.open(u.toString(), '_blank', 'noopener,noreferrer');
  } catch {
    // Invalid URL — silently ignore so we don't navigate anywhere unsafe.
  }
}

function locationMatches(itemLocation: string, query: string): boolean {
  if (!query.trim()) return true;
  if (!itemLocation) return false;
  return itemLocation.toLowerCase().includes(query.trim().toLowerCase());
}

export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const [posts, setPosts] = useState<ExtendedPost[]>([]);
  const [listings, setListings] = useState<ExternalListing[]>([]);
  const [marketplaceItems, setMarketplaceItems] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterId>('all');
  const [activeSort, setActiveSort] = useState<SortId>('newest');
  const [locationQuery, setLocationQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightId, setHighlightId] = useState<string | null>(null);
  // [LISTING_NAV] Marketplace cards used to open an inline modal via
  // `setDetailMarketplace`. PHASE 8 moves the detail UI to `/listing/:id`
  // so the state + modal are gone — navigation is the source of truth.
  const { user, profile, isAdmin } = useAuth();
  const { requireAuth } = useGuestAction();
  const [userLikes, setUserLikes] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savedMarketplaceIds, setSavedMarketplaceIds] = useState<Set<string>>(new Set());
  // Optimistic-delete bookkeeping. `deletingIds` blocks repeat clicks
  // while the request is in-flight. `removedIds` is a tombstone set so
  // that any in-flight poll/live-feed merge can't resurrect a row the
  // user just deleted. Toast is the user-facing confirmation.
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const blockedIdsRef = useRef<Set<string>>(blockedIds);
  useEffect(() => { blockedIdsRef.current = blockedIds; }, [blockedIds]);
  // First-time post-login onboarding checklist. Separate flag from the
  // pre-login splash (`tt_onboarded`) so signing in still triggers it.
  const [showHomeOnboarding, setShowHomeOnboarding] = useState(false);
  // Ref mirror so loadAll() (memoized with []) can read the latest
  // tombstone set without becoming stale or forcing a re-fetch loop.
  const removedIdsRef = useRef<Set<string>>(removedIds);
  useEffect(() => { removedIdsRef.current = removedIds; }, [removedIds]);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const showToast = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const handleDeletePost = useCallback(async (p: ExtendedPost) => {
    if (!user) return;
    if (deletingIds.has(p.id) || removedIds.has(p.id)) return;
    if (!canDeletePost(user, profile, p)) {
      showToast("You don't have permission to delete this post.", 'error');
      return;
    }
    const adminAction = isAdmin && p.user_id !== user.id;
    const confirmMsg = adminAction
      ? `Admin Delete — permanently remove this listing from the platform?\n\nThis cannot be undone.`
      : `Delete this listing?\n\nThis cannot be undone.`;
    if (!window.confirm(confirmMsg)) return;

    setDeletingIds((prev) => new Set(prev).add(p.id));
    // Optimistic: hide from feed immediately and close detail modal if open.
    setPosts((prev) => prev.filter((x) => x.id !== p.id));

    const res = await deletePost(communityPostToDeletable(p));
    setDeletingIds((prev) => {
      const next = new Set(prev);
      next.delete(p.id);
      return next;
    });

    if (res.ok) {
      // Tombstone first so the next poll filter sees it, then re-apply the
      // filter to posts immediately in case a live-feed poll landed during
      // the in-flight delete and resurrected the row.
      setRemovedIds((prev) => new Set(prev).add(p.id));
      setPosts((prev) => prev.filter((x) => x.id !== p.id));
      setListings((prev) => prev.filter((x) => x.id !== p.id));
      setMarketplaceItems((prev) => prev.filter((x) => x.id !== p.id));
      showToast(adminAction ? 'Admin delete: listing removed.' : 'Listing deleted.');
    } else {
      // Roll back optimistic removal.
      setPosts((prev) => prev.some((x) => x.id === p.id) ? prev : [p, ...prev]);
      showToast(`Couldn't delete: ${res.error ?? 'unknown error'}`, 'error');
    }
  }, [user, profile, isAdmin, deletingIds, removedIds, showToast]);

  useEffect(() => {
    if (user) fetchUserLikes(user.id).then(setUserLikes).catch(() => {});
    if (user) fetchBlockedIds(user.id).then(setBlockedIds).catch(() => {});
    try {
      const raw = localStorage.getItem('tt_saved_posts');
      if (raw) setSavedIds(new Set(JSON.parse(raw)));
    } catch {}
    try {
      const raw = localStorage.getItem('tt_saved_marketplace');
      if (raw) setSavedMarketplaceIds(new Set(JSON.parse(raw)));
    } catch {}
  }, [user]);

  // Surface the post-login onboarding checklist exactly once per device,
  // gated on auth so anonymous visitors don't see a "complete your profile"
  // prompt. Hidden again once dismissed.
  useEffect(() => {
    if (!user) { setShowHomeOnboarding(false); return; }
    try {
      const done = localStorage.getItem('tt_home_onboarded') === '1';
      setShowHomeOnboarding(!done);
    } catch { setShowHomeOnboarding(false); }
  }, [user]);

  const dismissHomeOnboarding = useCallback(() => {
    try { localStorage.setItem('tt_home_onboarded', '1'); } catch {}
    setShowHomeOnboarding(false);
  }, []);

  const handleLike = useCallback((id: string) => {
    requireAuth(() => {
      if (!user) return;
      const liked = userLikes.has(id);
      togglePostLike(user.id, id, liked).catch(() => {});
      setUserLikes((prev) => {
        const next = new Set(prev);
        if (liked) next.delete(id); else next.add(id);
        return next;
      });
      setPosts((prev) => prev.map((p) => p.id === id ? { ...p, like_count: liked ? Math.max(0, p.like_count - 1) : p.like_count + 1 } : p));
    });
  }, [user, userLikes, requireAuth]);

  const handleSave = useCallback((id: string) => {
    requireAuth(() => {
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        try { localStorage.setItem('tt_saved_posts', JSON.stringify([...next])); } catch {}
        return next;
      });
    });
  }, [requireAuth]);

  const handleSaveMarketplace = useCallback((id: string) => {
    requireAuth(() => {
      setSavedMarketplaceIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        try { localStorage.setItem('tt_saved_marketplace', JSON.stringify([...next])); } catch {}
        return next;
      });
    });
  }, [requireAuth]);

  const handleShareMarketplace = useCallback(async (m: MarketplaceListing) => {
    const url = typeof window !== 'undefined' ? `${window.location.origin}/marketplace` : '';
    const text = m.title;
    const nav: any = typeof navigator !== 'undefined' ? navigator : null;
    if (nav && 'share' in nav) {
      try { await nav.share({ title: text, text, url }); } catch {}
    } else if (nav?.clipboard) {
      try { await nav.clipboard.writeText(`${text} ${url}`.trim()); } catch {}
    }
  }, []);
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Pull highlight target + optimistically-prepended post from navigation
  // state (from Flash Finds / Rare Radar post-submission flow).
  //
  // OPTIMISTIC PREPEND: when the upload flow passes the freshly-created
  // post object via `state.newPost`, we splice it into the local `posts`
  // array IMMEDIATELY so the user sees their upload the instant Home
  // mounts — no waiting on the next poll RTT. The subsequent `loadAll()`
  // (kicked off by the highlightPostId effect below) will return the
  // server's authoritative copy; we dedupe by id so we never render
  // duplicates.
  useEffect(() => {
    const navState = location.state as {
      highlightPostId?: string;
      newPost?: ExtendedPost;
    } | null;
    if (navState?.highlightPostId) {
      setHighlightId(navState.highlightPostId);
    }
    if (navState?.newPost) {
      const incoming = navState.newPost;
      setPosts((prev) => {
        if (prev.some((p) => p.id === incoming.id)) return prev;
        if (import.meta.env.DEV) console.log('[FEED_RENDER] optimistic prepend id=', incoming.id);
        return [incoming, ...prev];
      });
    }
    if (navState?.highlightPostId || navState?.newPost) {
      // Clear router state so a manual refresh doesn't re-highlight or
      // re-prepend a stale post.
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const loadAll = useCallback((opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    // When called silently (from useLiveFeed), we rethrow on failure so
    // the hook's exponential backoff engages. The user-facing loadError
    // is still set, so the manual reload button still reflects state.
    const silent = opts?.silent === true;
    return Promise.all([
      fetchCommunityPosts(50),
      // external_listings: SELECT * so any missing optional columns (e.g.
      // start_at before its migration is applied) don't fail the whole
      // query. Phase 5's eventSchedule falls back to created_at when
      // start_at is absent, so listings keep rendering either way.
      supabase
        .from('external_listings')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('marketplace_listings')
        .select('id,seller_id,title,description,price,condition,category,image_url,local_pickup,shipping_available,general_location,marketplace_found,scout_needed,status,created_at')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(30),
    ])
      .then(([communityPosts, listingsRes, marketRes]) => {
        // Community posts is the PRIMARY feed source; it must render even
        // if one of the secondary tables returns an error or is missing.
        // Filter through `removedIds` so the 10s live-feed poll cannot
        // resurrect a row that the current user just deleted before the
        // DB replication settles.
        const tombstones = removedIdsRef.current;
        setPosts((communityPosts as ExtendedPost[]).filter((p) => !tombstones.has(p.id)));
        if (listingsRes.data) setListings((listingsRes.data as ExternalListing[]).filter((l) => !tombstones.has(l.id)));
        if (marketRes.data) setMarketplaceItems((marketRes.data as MarketplaceListing[]).filter((m) => !tombstones.has(m.id)));

        // Treat the following Supabase errors as soft (don't surface to
        // the user, don't trigger backoff) — they mean an optional table
        // or column has not yet been provisioned in this project:
        //   PGRST205  Missing table in PostgREST schema cache
        //   PGRST204  Missing column in PostgREST schema cache
        //   42703     Undefined column at the SQL layer
        //   42P01     Undefined table at the SQL layer
        const isSoft = (e: { code?: string } | null | undefined) =>
          !e || ['PGRST205', 'PGRST204', '42703', '42P01'].includes(e.code ?? '');

        if (listingsRes.error && !isSoft(listingsRes.error)) {
          console.error('[SUPABASE_QUERY_FAIL] table=external_listings source=Home.loadAll', listingsRes.error);
        } else if (listingsRes.error) {
          console.warn('[HOME_FEED_FETCH] external_listings soft-skip', listingsRes.error.code, listingsRes.error.message);
        }
        if (marketRes.error && !isSoft(marketRes.error)) {
          console.error('[SUPABASE_QUERY_FAIL] table=marketplace_listings source=Home.loadAll', marketRes.error);
        } else if (marketRes.error) {
          console.warn('[HOME_FEED_FETCH] marketplace_listings soft-skip', marketRes.error.code, marketRes.error.message);
        }

        // Only surface the "could not load" banner if a HARD failure
        // happened on a secondary source. Community posts are handled
        // by their own throw path below.
        const hardFailures = [
          listingsRes.error && !isSoft(listingsRes.error) ? listingsRes.error : null,
          marketRes.error && !isSoft(marketRes.error) ? marketRes.error : null,
        ].filter(Boolean);
        setLoadError(hardFailures.length > 0 ? 'Some items could not load. Pull to refresh.' : null);
      })
      .catch((err) => {
        console.error('[SUPABASE_QUERY_FAIL] source=Home.loadAll fatal', err);
        setLoadError('Could not load the feed. Check your connection and try again.');
        if (silent) throw err;
      })
      .finally(() => setLoading(false));
  }, []);

  // Live refresh — silently re-pull the feed every 10s so newly uploaded
  // posts/events/marketplace listings appear without a manual refresh.
  // The hook pauses when the tab is hidden and prevents overlapping fetches.
  useLiveFeed(() => loadAll({ silent: true }), !loading);

  const didInitialLoadRef = useRef(false);
  useEffect(() => {
    if (didInitialLoadRef.current) return;
    didInitialLoadRef.current = true;
    loadAll().catch(() => {});
  }, [loadAll]);

  // Independent of the one-shot initial load: re-check reminders whenever
  // the authenticated user becomes known (e.g. after a delayed session restore).
  useEffect(() => {
    if (!user?.id) return;
    checkLocalReminders(user.id).catch(() => {});
  }, [user?.id]);

  // When a user navigates back to Home from a post-create flow, the navigation
  // state includes highlightPostId; refetch so the brand-new post is in view.
  // Skip the first mount (already covered by initial load above) — using a
  // dedicated ref because didInitialLoadRef is set synchronously by the
  // initial-load effect, which runs *before* this one and would otherwise
  // cause a double fetch on mounts that arrive with highlight state.
  const navStateSeenRef = useRef(false);
  useEffect(() => {
    if (!navStateSeenRef.current) { navStateSeenRef.current = true; return; }
    const navState = location.state as { highlightPostId?: string } | null;
    if (navState?.highlightPostId) loadAll();
  }, [location.state, loadAll]);

  // Once posts arrive, if we have a highlightId, scroll to it.
  useEffect(() => {
    if (!highlightId) return;
    const el = itemRefs.current.get(highlightId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Auto-clear the highlight after the flash animation runs.
      const t = window.setTimeout(() => setHighlightId(null), 3500);
      return () => window.clearTimeout(t);
    }
  }, [highlightId, posts, listings]);

  const items: FeedItem[] = useMemo(() => {
    const out: FeedItem[] = [];

    for (const p of posts) {
      const filterIds = new Set<FilterId>(['all']);
      const cat = categoryToFilterId(p.category);
      if (cat) filterIds.add(cat);
      const type = postTypeFilterId(p.type);
      if (type) filterIds.add(type);
      if (p.marketplace_found)                filterIds.add('marketplace');
      const loc = p.general_location || p.location || '';
      const createdMs = new Date(p.created_at).getTime() || 0;
      out.push({
        kind: 'post',
        id: p.id,
        raw: p,
        filterIds,
        location: loc,
        searchText: [p.caption, p.category, loc, p.marketplace_found, p.type].filter(Boolean).join(' ').toLowerCase(),
        sortNewest: createdMs,
        sortTrending: (p.like_count || 0) * 2 + (p.comment_count || 0) + (p.share_count || 0),
        sortMostWanted: (p.scout_needed ? 1000 : 0) + (p.type === 'rare_radar' ? 500 : 0) + (p.like_count || 0),
        sortEndingSoon: Infinity,
        sortLivePriority: 9, // non-event content sits below live events
      });
    }

    for (const l of listings) {
      const filterIds = new Set<FilterId>(['all']);
      const cat = categoryToFilterId(l.category);
      if (cat) filterIds.add(cat);
      const t = listingTypeFilterId(l.listing_type);
      if (t) filterIds.add(t);
      const loc = l.general_location || l.location || '';
      const createdMs = new Date(l.created_at).getTime() || 0;
      const endsMs = l.ends_at ? new Date(l.ends_at).getTime() : NaN;
      const status = deriveStatus(l);
      const livePri = statusPriority(status);
      out.push({
        kind: 'listing',
        id: l.id,
        raw: l,
        filterIds,
        location: loc,
        searchText: [l.title, l.description, l.category, loc, l.platform].filter(Boolean).join(' ').toLowerCase(),
        sortNewest: createdMs,
        sortTrending: status === 'live' ? 200 : (status === 'ending_soon' ? 150 : ((l.listing_type === 'live_stream' || l.listing_type === 'auction') ? 100 : 0)),
        sortMostWanted: l.scout_needed ? 1000 : 0,
        sortEndingSoon: isFinite(endsMs) && status !== 'ended' ? Math.max(0, endsMs - Date.now()) : Infinity,
        sortLivePriority: livePri,
      });
    }

    for (const m of marketplaceItems) {
      const filterIds = new Set<FilterId>(['all', 'marketplace']);
      const cat = categoryToFilterId(m.category);
      if (cat) filterIds.add(cat);
      const loc = m.general_location || '';
      const createdMs = new Date(m.created_at).getTime() || 0;
      out.push({
        kind: 'marketplace',
        id: m.id,
        raw: m,
        filterIds,
        location: loc,
        searchText: [m.title, m.description, m.category, m.condition, loc, m.marketplace_found, (m.marketplace_found || '').replace(/_/g, ' ')].filter(Boolean).join(' ').toLowerCase(),
        sortNewest: createdMs,
        sortTrending: 0,
        sortMostWanted: m.scout_needed ? 1000 : 0,
        sortEndingSoon: Infinity,
        sortLivePriority: 9,
      });
    }

    return out;
  }, [posts, listings, marketplaceItems]);

  const visibleItems = useMemo(() => {
    let v = items.filter((i) => i.filterIds.has(activeFilter));
    if (locationQuery.trim()) {
      v = v.filter((i) => locationMatches(i.location, locationQuery));
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      v = v.filter((i) => i.searchText.includes(q));
    }
    // T010 — drop blocked users' content and obviously-broken cards (no
    // title/caption AND no image). Blocked filter is soft UX, enforced
    // client-side only; broken-card filter keeps the feed presentable.
    if (blockedIds.size > 0) {
      v = v.filter((i) => {
        const r: any = i.raw;
        const ownerId = r.user_id ?? r.seller_id ?? r.submitted_by ?? null;
        return !ownerId || !blockedIds.has(ownerId);
      });
    }
    v = v.filter((i) => {
      const r: any = i.raw;
      const hasTitle = !!(r.title || r.caption);
      const hasImage = !!(r.image_url || r.image || (Array.isArray(r.images) && r.images.length > 0));
      return hasTitle || hasImage;
    });
    if (activeSort === 'ending_soon') {
      v = v.filter((i) => isFinite(i.sortEndingSoon));
    }
    // For event listings, live > upcoming > ended within their kind.
    // Posts and marketplace items keep their normal time-based ordering;
    // we only apply sortLivePriority when comparing two listings, so we
    // don't push fresh posts below ended listings.
    const livePriCmp = (a: FeedItem, b: FeedItem) =>
      (a.kind === 'listing' && b.kind === 'listing') ? a.sortLivePriority - b.sortLivePriority : 0;
    const cmp: Record<SortId, (a: FeedItem, b: FeedItem) => number> = {
      newest:      (a, b) => livePriCmp(a, b) || (b.sortNewest - a.sortNewest),
      trending:    (a, b) => livePriCmp(a, b) || (b.sortTrending - a.sortTrending) || (b.sortNewest - a.sortNewest),
      most_wanted: (a, b) => (b.sortMostWanted - a.sortMostWanted) || livePriCmp(a, b) || (b.sortNewest - a.sortNewest),
      ending_soon: (a, b) => a.sortEndingSoon - b.sortEndingSoon,
    };
    return v.slice().sort(cmp[activeSort]);
  }, [items, activeFilter, activeSort, locationQuery, searchQuery, blockedIds]);

  // Pin the highlighted item to the top so it's immediately visible.
  const orderedItems = useMemo(() => {
    if (!highlightId) return visibleItems;
    const idx = visibleItems.findIndex((i) => i.id === highlightId);
    if (idx <= 0) return visibleItems;
    return [visibleItems[idx], ...visibleItems.slice(0, idx), ...visibleItems.slice(idx + 1)];
  }, [visibleItems, highlightId]);

  const radarListings = listings
    .filter((l) => l.listing_type === 'live_stream' || l.listing_type === 'auction')
    .slice(0, 6);

  const setItemRef = (id: string) => (el: HTMLElement | null) => {
    if (el) itemRefs.current.set(id, el);
    else itemRefs.current.delete(id);
  };

  return (
    <div style={styles.container}>
      <style>{`@keyframes feedHighlight { 0% { box-shadow: 0 0 0 4px var(--color-primary-400); transform: scale(1.01); } 100% { box-shadow: var(--shadow-md); transform: scale(1); } }`}</style>

      <header style={styles.header}>
        <TreasureChestBrand />
        <div style={styles.headerActions}>
          <NotificationBell />
          <TooltipBtn onClick={() => setShowInfo(true)} btnStyle={styles.infoBtn} label="How It Works" desc="Learn what TreasureTrail does">
            <HelpCircle size={15} style={{ color: 'var(--color-neutral-500)' }} />
          </TooltipBtn>
          <button onClick={() => navigate('/pro')} style={styles.proBtn} title="Premium Membership — Unlock all tools">
            <Crown size={12} style={{ color: 'var(--color-primary-700)' }} />
            <span style={styles.proBtnText}>Pro</span>
          </button>
          <TooltipBtn onClick={() => navigate('/live')} btnStyle={styles.liveBtn} label="Live Hub" desc="Active missions and live events">
            <Zap size={14} style={{ color: 'var(--color-error-500)' }} />
          </TooltipBtn>
          <TooltipBtn onClick={() => navigate('/community')} btnStyle={styles.communityBtn} label="Community" desc="Share finds with other hunters">
            <Users size={14} style={{ color: 'var(--color-secondary-600)' }} />
          </TooltipBtn>
          <TooltipBtn onClick={() => navigate('/marketplace')} btnStyle={styles.marketBtn} label="Marketplace" desc="Browse and list items for sale">
            <ShoppingBag size={14} style={{ color: 'var(--color-accent-600)' }} />
          </TooltipBtn>
          <TooltipBtn onClick={() => navigate('/events')} btnStyle={styles.eventsBtn} label="Events" desc="Estate sales and local events">
            <Calendar size={14} style={{ color: 'var(--color-success-600)' }} />
          </TooltipBtn>
          <TooltipBtn onClick={() => navigate('/scout-map')} btnStyle={styles.mapBtn} label="Scout Map" desc="View hunter activity near you">
            <MapPin size={16} style={{ color: 'var(--color-secondary-600)' }} />
          </TooltipBtn>
          <TooltipBtn onClick={() => navigate('/auctions')} btnStyle={styles.auctionBtn} label="Auction Radar" desc="Discover live auctions and scout opportunities">
            <Gavel size={16} style={{ color: 'var(--color-primary-600)' }} />
          </TooltipBtn>
        </div>
      </header>

      <div style={styles.categories}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setActiveFilter(f.id)}
            style={{
              ...styles.categoryChip,
              ...(f.id === activeFilter ? styles.categoryChipActive : {}),
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div style={styles.searchRow}>
        <div style={styles.searchField}>
          <Search size={14} style={{ color: 'var(--color-neutral-400)' }} />
          <input
            type="text"
            placeholder="Search titles, categories, marketplaces…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.locationInput}
            aria-label="Search feed"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={styles.locationClear} aria-label="Clear search">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div style={styles.filterRow}>
        <div style={styles.locationField}>
          <MapPin size={13} style={{ color: 'var(--color-neutral-400)' }} />
          <input
            type="text"
            placeholder="City, state, or ZIP"
            value={locationQuery}
            onChange={(e) => setLocationQuery(e.target.value)}
            style={styles.locationInput}
            aria-label="Filter by location"
          />
          {locationQuery && (
            <button onClick={() => setLocationQuery('')} style={styles.locationClear} aria-label="Clear location">
              <X size={12} />
            </button>
          )}
        </div>
        <select
          value={activeSort}
          onChange={(e) => setActiveSort(e.target.value as SortId)}
          style={styles.sortSelect}
          aria-label="Sort feed"
        >
          {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      {/* Auction Radar strip — only when no filter restricts the view */}
      {activeFilter === 'all' && radarListings.length > 0 && (
        <div style={styles.radarSection}>
          <div style={styles.radarHeader}>
            <div style={styles.radarLiveDot} />
            <span style={styles.radarTitle}>Auction Radar</span>
            <button onClick={() => navigate('/auctions')} style={styles.radarSeeAll}>See All</button>
          </div>
          <div style={styles.radarScroll}>
            {radarListings.map((listing) => (
              <AuctionRadarCard key={listing.id} listing={listing} onClick={() => navigate('/auctions')} />
            ))}
          </div>
        </div>
      )}

      {highlightId && !loading && !orderedItems.some((i) => i.id === highlightId) && (
        <div style={styles.highlightBanner} role="status">
          <span style={styles.highlightBannerText}>
            Your post is hidden by current filters.
          </span>
          <button
            onClick={() => { setActiveFilter('all'); setLocationQuery(''); setSearchQuery(''); setActiveSort('newest'); }}
            style={styles.highlightBannerBtn}
          >
            Show it
          </button>
          <button
            onClick={() => setHighlightId(null)}
            style={{ ...styles.highlightBannerBtn, backgroundColor: 'transparent', color: 'var(--color-neutral-500)' }}
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {user && showHomeOnboarding && (
        <div style={styles.onboardCard} role="region" aria-label="Get started checklist">
          <div style={styles.onboardHeader}>
            <Crown size={16} style={{ color: 'var(--color-primary-500)' }} />
            <span style={styles.onboardTitle}>Get started on TreasureTrail</span>
            <button
              onClick={dismissHomeOnboarding}
              style={styles.onboardDismiss}
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
          <ul style={styles.onboardList}>
            <li style={styles.onboardItem}>
              <span style={(profile?.bio && profile?.avatar_url) ? styles.onboardCheckOn : styles.onboardCheckOff}>
                {(profile?.bio && profile?.avatar_url) ? '✓' : '1'}
              </span>
              <button onClick={() => navigate('/profile')} style={styles.onboardLink}>
                Complete your profile
              </button>
            </li>
            <li style={styles.onboardItem}>
              <span style={styles.onboardCheckOff}>2</span>
              <button onClick={() => navigate('/flash-finds')} style={styles.onboardLink}>
                Share your first find
              </button>
            </li>
            <li style={styles.onboardItem}>
              <span style={((profile?.following_count ?? 0) > 0) ? styles.onboardCheckOn : styles.onboardCheckOff}>
                {((profile?.following_count ?? 0) > 0) ? '✓' : '3'}
              </span>
              <button onClick={() => navigate('/community')} style={styles.onboardLink}>
                Follow your first scout
              </button>
            </li>
          </ul>
        </div>
      )}

      <div style={styles.feed}>
        {loadError && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)',
            margin: '0 var(--space-4) var(--space-3)',
            backgroundColor: 'var(--color-error-50)',
            border: '1px solid var(--color-error-200)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-error-700)',
            fontSize: 'var(--font-size-sm)',
          }} role="alert">
            <span>{loadError}</span>
            <button
              onClick={() => loadAll()}
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--color-error-600)',
                color: 'var(--color-neutral-0)',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 600,
              }}
            >
              Retry
            </button>
          </div>
        )}

        {loading && (
          <SkeletonList count={3} />
        )}

        {!loading && orderedItems.length === 0 && (() => {
          const isTrulyEmpty = activeFilter === 'all' && !searchQuery && !locationQuery;
          return (
            <EmptyState
              icon={Search}
              title={isTrulyEmpty ? 'No finds yet' : 'Nothing matches those filters'}
              body={
                isTrulyEmpty
                  ? 'Be the first to share a find — your post will appear in the feed for the whole TreasureTrail community.'
                  : activeFilter === 'all'
                    ? 'Try clearing your location filter to see more finds.'
                    : 'Try a different category or clear your filters.'
              }
              action={
                isTrulyEmpty ? undefined : (
                  <button
                    onClick={() => { setActiveFilter('all'); setLocationQuery(''); setSearchQuery(''); setActiveSort('newest'); }}
                    style={styles.emptyBtn}
                  >
                    Reset Filters
                  </button>
                )
              }
            />
          );
        })()}

        {orderedItems.map((item, index) => {
          const isHL = item.id === highlightId;
          const baseStyle: React.CSSProperties = {
            ...styles.card,
            animationDelay: `${Math.min(index, 8) * 60}ms`,
          };
          const hlStyle: React.CSSProperties = isHL
            ? { animation: 'feedHighlight 3.2s ease-out forwards' }
            : {};
          if (item.kind === 'listing') {
            const l = item.raw as ExternalListing;
            return (
              <div
                key={`l-${item.id}`}
                ref={setItemRef(item.id)}
                style={{ ...baseStyle, ...hlStyle }}
              >
                <ExternalListingCard listing={l} index={index} onClick={() => openExternalUrl(l.external_url)} />
              </div>
            );
          }
          if (item.kind === 'marketplace') {
            const m = item.raw as MarketplaceListing;
            return (
              <div
                key={`m-${item.id}`}
                ref={setItemRef(item.id)}
                style={{ ...baseStyle, ...hlStyle }}
              >
                <MarketplaceCard
                  listing={m}
                  saved={savedMarketplaceIds.has(m.id)}
                  onOpen={() => navigate(`/listing/${m.id}`)}
                  onSave={() => handleSaveMarketplace(m.id)}
                  onShare={() => handleShareMarketplace(m)}
                />
              </div>
            );
          }
          const p = item.raw as ExtendedPost;
          // [FLASH_RENDER_OBJECT] Last-line-of-defense validation. If the
          // row is structurally malformed (id missing, caption is an
          // object/array, etc.) we render an explicit error placeholder
          // instead of attempting the normal card — which would otherwise
          // collapse into the "blank white card" the user reported. The
          // placeholder still occupies layout so the feed never jumps.
          const validation = validateFeedItem(p);
          if (!validation.ok) {
            console.warn('[FLASH_RENDER_OBJECT] invalid feed item', {
              id: (p as { id?: unknown }).id,
              issues: validation.issues,
            });
            return (
              <article
                key={`p-${item.id}`}
                ref={setItemRef(item.id)}
                style={{ ...baseStyle, ...hlStyle, padding: 'var(--space-4)' }}
              >
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
                  alignItems: 'center', justifyContent: 'center',
                  minHeight: '120px', textAlign: 'center',
                  color: 'var(--color-neutral-500)',
                }}>
                  <span style={{ fontWeight: 600 }}>This find couldn't be displayed</span>
                  <span style={{ fontSize: '13px' }}>
                    Pull to refresh — the next sync should fix it.
                  </span>
                </div>
              </article>
            );
          }
          const badge = postBadge(p);
          // [FEED_RENDER] Defensive fallbacks: never render a card whose
          // title/alt text is empty. p.caption SHOULD already be normalized
          // at insert time (see createCommunityPost), but legacy rows or
          // any future code path that bypasses the helper would otherwise
          // collapse to a card with only the badge.
          const displayCaption = (p.caption ?? '').trim() || 'Untitled Find';
          return (
            <article
              key={`p-${item.id}`}
              ref={setItemRef(item.id)}
              style={{ ...baseStyle, ...hlStyle }}
            >
              {/* [CARD_CLICK] Hero image area is the primary tap target for
                  opening the dedicated /find/:id detail page. role=button +
                  keyboard support keep this accessible without nesting a
                  <button> inside the surrounding <article>. */}
              <div
                style={{ ...styles.cardImageContainer, cursor: 'pointer' }}
                role="button"
                tabIndex={0}
                aria-label={`Open ${displayCaption}`}
                onClick={() => navigate(`/find/${p.id}`)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/find/${p.id}`); } }}
              >
                <ImageWithFade
                  src={p.image_url}
                  alt={displayCaption}
                  style={styles.cardImage}
                  fallback={<ImageFallback icon={Bookmark} />}
                />
                <div style={styles.badgeStack}>
                  {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
                  {p.scout_needed && <Badge variant="scout">Scout Needed</Badge>}
                </div>
                {p.marketplace_found && (
                  <div style={styles.priceBadgeWrap}>
                    <Badge variant="marketplace">{formatMarketplace(p.marketplace_found)}</Badge>
                  </div>
                )}
              </div>

              <div style={styles.cardContent}>
                <div style={styles.cardHeader}>
                  {/* [CARD_CLICK] Avatar+username link to the uploader's
                      public profile page. If the post has no joined profile
                      row (anonymous/legacy data) we render a non-interactive
                      div instead of a dead button — no dead clicks. */}
                  {p.profiles?.username ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/profile/${p.profiles!.username}`);
                      }}
                      aria-label={`View @${p.profiles.username}'s profile`}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                        border: 'none', background: 'transparent', padding: 0,
                        cursor: 'pointer',
                        minHeight: 44,
                        flex: 1, minWidth: 0,
                      }}
                    >
                      <div style={{ ...styles.avatar, backgroundColor: 'var(--color-primary-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, color: 'var(--color-primary-700)' }}>
                        {p.profiles.username.slice(0, 1).toUpperCase()}
                      </div>
                      <div style={styles.cardMeta}>
                        <span style={styles.username}>@{p.profiles.username}</span>
                        <span style={styles.timeAgo}>
                          {new Date(p.created_at).toLocaleDateString()}
                          {item.location ? ` • ${item.location}` : ''}
                        </span>
                      </div>
                    </button>
                  ) : (
                    <div
                      style={{
                        display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                        minHeight: 44, flex: 1, minWidth: 0,
                      }}
                    >
                      <div style={{ ...styles.avatar, backgroundColor: 'var(--color-primary-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, color: 'var(--color-primary-700)' }}>
                        U
                      </div>
                      <div style={styles.cardMeta}>
                        <span style={styles.username}>@hunter</span>
                        <span style={styles.timeAgo}>
                          {new Date(p.created_at).toLocaleDateString()}
                          {item.location ? ` • ${item.location}` : ''}
                        </span>
                      </div>
                    </div>
                  )}
                  {/* [FEED_RENDER] Always show a category chip so the
                      card's meta row has consistent visual weight; default
                      to "Other" when the field is missing/empty. */}
                  <span style={styles.categoryTag}>
                    {(p.category ?? '').trim() || 'Other'}
                  </span>
                </div>

                {/* [CARD_CLICK] Title is a real <button> styled as a heading
                    so it gets native Enter+Space activation and a guaranteed
                    44px minimum tap target. Wraps an <h3> so the document
                    outline still announces the post title. */}
                <button
                  onClick={() => navigate(`/find/${p.id}`)}
                  aria-label={`Open ${displayCaption}`}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    margin: 0,
                    minHeight: 44,
                    cursor: 'pointer',
                  }}
                >
                  <h3 style={styles.cardTitle}>{displayCaption}</h3>
                </button>

                <div style={styles.cardActions}>
                  <button
                    style={styles.actionBtn}
                    aria-label={userLikes.has(p.id) ? 'Unlike' : 'Like'}
                    onClick={() => handleLike(p.id)}
                  >
                    <Heart
                      size={18}
                      style={{
                        color: userLikes.has(p.id) ? 'var(--color-error-500)' : undefined,
                        fill: userLikes.has(p.id) ? 'var(--color-error-500)' : 'none',
                      }}
                    />
                    <span>{p.like_count}</span>
                  </button>
                  <div style={{ ...styles.actionBtn, opacity: 0.5, cursor: 'default' }} aria-label="Comments" title="Comments coming soon">
                    <MessageCircle size={18} />
                    <span>{p.comment_count}</span>
                  </div>
                  <button
                    style={styles.actionBtn}
                    aria-label={savedIds.has(p.id) ? 'Unsave' : 'Save'}
                    onClick={() => handleSave(p.id)}
                  >
                    <Bookmark
                      size={18}
                      style={{
                        color: savedIds.has(p.id) ? 'var(--color-primary-600)' : undefined,
                        fill: savedIds.has(p.id) ? 'var(--color-primary-600)' : 'none',
                      }}
                    />
                  </button>
                  <button
                    style={styles.actionBtn}
                    aria-label="Share"
                    onClick={async () => {
                      const url = typeof window !== 'undefined' ? window.location.origin : '';
                      const text = p.caption;
                      const nav: any = typeof navigator !== 'undefined' ? navigator : null;
                      if (nav && 'share' in nav) {
                        try { await nav.share({ title: text, text, url }); } catch {}
                      } else if (nav?.clipboard) {
                        try { await nav.clipboard.writeText(`${text} ${url}`.trim()); } catch {}
                      }
                    }}
                  >
                    <Share2 size={18} />
                  </button>
                  {p.type === 'rare_radar' && (
                    <button style={styles.actionBtn} onClick={() => navigate('/rare-radar')} aria-label="Open in Rare Radar">
                      <Eye size={18} />
                    </button>
                  )}
                  {canDeletePost(user, profile, p) && (
                    <button
                      style={{
                        ...styles.actionBtn,
                        marginLeft: 'auto',
                        color: isAdmin && p.user_id !== user?.id
                          ? 'var(--color-warning-600, #b45309)'
                          : 'var(--color-error-600, #b91c1c)',
                        opacity: deletingIds.has(p.id) ? 0.5 : 1,
                        cursor: deletingIds.has(p.id) ? 'wait' : 'pointer',
                      }}
                      aria-label={isAdmin && p.user_id !== user?.id ? 'Admin delete' : 'Delete'}
                      title={isAdmin && p.user_id !== user?.id ? 'Admin Delete' : 'Delete'}
                      disabled={deletingIds.has(p.id)}
                      onClick={(e) => { e.stopPropagation(); handleDeletePost(p); }}
                    >
                      {isAdmin && p.user_id !== user?.id ? <Shield size={18} /> : <Trash2 size={18} />}
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {showInfo && <InfoPanel onClose={() => setShowInfo(false)} />}
      {/* [DETAIL_PAGE] The legacy in-feed PostDetailModal was removed in
          favour of the dedicated /find/:id route (see FindDetail.tsx and
          FIND_DETAIL_SYSTEM.md). Card and image-area clicks now navigate
          to that route so URLs are shareable and deep-linkable. */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)',
            transform: 'translateX(-50%)',
            backgroundColor: toast.tone === 'error' ? 'var(--color-error-600, #b91c1c)' : 'var(--color-neutral-900, #111)',
            color: '#fff',
            padding: '12px 18px',
            borderRadius: 'var(--radius-md, 8px)',
            fontSize: 'var(--font-size-sm, 14px)',
            fontWeight: 600,
            boxShadow: '0 10px 25px rgba(0,0,0,0.25)',
            zIndex: 2000,
            maxWidth: 'min(92vw, 420px)',
            textAlign: 'center',
          }}
        >
          {toast.message}
        </div>
      )}
      {/* [LISTING_NAV] The inline MarketplaceDetailModal was removed
          in PHASE 8. Marketplace cards now navigate to `/listing/:id`
          for a shareable, deep-linkable detail page with messaging,
          scout, save, and follow actions. */}
    </div>
  );
}

function MarketplaceCard({
  listing,
  saved,
  onOpen,
  onSave,
  onShare,
}: {
  listing: MarketplaceListing;
  saved: boolean;
  onOpen: () => void;
  onSave: () => void;
  onShare: () => void;
}) {
  const priceDisplay = typeof listing.price === 'number' ? `$${listing.price.toFixed(2)}` : '';
  const marketplaceLabel = formatMarketplace(listing.marketplace_found);
  return (
    <article style={styles.card}>
      <div style={styles.cardImageContainer}>
        <ImageWithFade
          src={listing.image_url}
          alt={listing.title}
          style={styles.cardImage}
          fallback={<ImageFallback icon={ShoppingBag} />}
        />
        <div style={styles.badgeStack}>
          {marketplaceLabel && <Badge variant="marketplace">{marketplaceLabel}</Badge>}
          {listing.scout_needed && <Badge variant="scout">Scout Needed</Badge>}
        </div>
        {priceDisplay && (
          <span style={styles.priceBadge}>{priceDisplay}</span>
        )}
      </div>
      <div style={styles.cardContent}>
        <h3
          style={{ ...styles.cardTitle, cursor: 'pointer' }}
          onClick={onOpen}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
        >
          {listing.title}
        </h3>
        {listing.description && (
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-600)', marginBottom: 'var(--space-2)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {listing.description}
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {listing.category && <Badge variant="category">{listing.category}</Badge>}
          {listing.condition && <Badge variant="neutral">{listing.condition}</Badge>}
          {listing.local_pickup && <Badge variant="pickup" icon={MapPin}>Local Pickup</Badge>}
          {listing.shipping_available && <Badge variant="shipping">Ships</Badge>}
          {listing.general_location && <Badge variant="neutral" icon={MapPin}>{listing.general_location}</Badge>}
        </div>
        <div style={{ ...styles.cardActions, marginTop: 'var(--space-2)' }}>
          <button
            style={styles.actionBtn}
            aria-label={saved ? 'Unsave listing' : 'Save listing'}
            onClick={onSave}
          >
            <Bookmark
              size={18}
              style={{
                color: saved ? 'var(--color-primary-600)' : undefined,
                fill: saved ? 'var(--color-primary-600)' : 'none',
              }}
            />
          </button>
          <button
            style={styles.actionBtn}
            aria-label="Share listing"
            onClick={onShare}
          >
            <Share2 size={18} />
          </button>
          <button
            style={{ ...styles.actionBtn, marginLeft: 'auto' }}
            aria-label="View details"
            onClick={onOpen}
          >
            <Eye size={18} />
            <span style={{ fontSize: 'var(--font-size-xs)' }}>View</span>
          </button>
        </div>
      </div>
    </article>
  );
}


// Silence unused-import lints for icons reserved for upcoming feed actions.
void Search;

const FEATURES = [
  {
    icon: Camera,
    color: 'var(--color-primary-600)',
    bg: 'var(--color-primary-50)',
    title: 'Flash Finds',
    desc: 'Photograph any item at a sale or thrift store and instantly log it to your collection.',
  },
  {
    icon: Brain,
    color: 'var(--color-secondary-600)',
    bg: 'var(--color-secondary-50)',
    title: 'AI Value Estimation',
    desc: 'Get instant AI-powered assessments of rarity, resale potential, and pricing guidance.',
  },
  {
    icon: Radar,
    color: 'var(--color-accent-600)',
    bg: 'var(--color-accent-50)',
    title: 'RARE Radar',
    desc: 'Set up searches for specific items. Get alerted when matching finds appear in your area.',
  },
  {
    icon: Gavel,
    color: 'var(--color-warning-600)',
    bg: 'var(--color-warning-50)',
    title: 'Auction Radar',
    desc: 'Discover live Whatnot streams, HiBid auctions, Poshmark listings, and estate sales in one feed.',
  },
  {
    icon: Users,
    color: 'var(--color-success-600)',
    bg: 'var(--color-success-50)',
    title: 'Scout Network',
    desc: 'Hire local scouts to inspect or pick up items for you, or offer your own scout services.',
  },
  {
    icon: ShoppingBag,
    color: 'var(--color-error-500)',
    bg: 'var(--color-error-50)',
    title: 'Marketplace',
    desc: 'List items for fixed-price sale and browse community listings across all categories.',
  },
];

const COMPARISONS = [
  {
    feature: 'Discovery-focused',
    tt: 'Built around the thrill of finding — sales, estates, thrift stores.',
    others: 'Listing-first: you already know what you want.',
  },
  {
    feature: 'Live treasure hunting',
    tt: 'Scan, log, and share finds in real time while you\'re out hunting.',
    others: 'No in-the-field tools. You list after the fact.',
  },
  {
    feature: 'AI valuation',
    tt: 'Instant AI estimates help you decide on the spot.',
    others: 'Manual research required outside the platform.',
  },
  {
    feature: 'Community scouts',
    tt: 'Hire local hunters to inspect or pick up items for you.',
    others: 'No scouting network. You\'re on your own.',
  },
  {
    feature: 'Flip culture',
    tt: 'Built for resellers, pickers, and collectors who love the hunt.',
    others: 'General buying and selling — no focus on the flip.',
  },
];
function InfoPanel({ onClose }: { onClose: () => void }) {
  return (
    <div style={panelStyles.overlay} onClick={onClose}>
      <div style={panelStyles.sheet} onClick={(e) => e.stopPropagation()}>
        {/* Handle */}
        <div style={panelStyles.handle} />

        {/* Header */}
        <div style={panelStyles.header}>
          <div>
            <h2 style={panelStyles.title}>How TreasureTrail Works</h2>
            <p style={panelStyles.subtitle}>The app built for real-world treasure hunters</p>
          </div>
          <button onClick={onClose} style={panelStyles.closeBtn}>
            <X size={18} style={{ color: 'var(--color-neutral-500)' }} />
          </button>
        </div>

        <div style={panelStyles.body}>
          {/* What is it */}
          <div style={panelStyles.introBanner}>
            <p style={panelStyles.introText}>
              TreasureTrail is a live treasure hunting platform — part community, part marketplace, part AI tool — designed for people who love finding, flipping, and collecting real-world items.
            </p>
          </div>

          {/* Features */}
          <h3 style={panelStyles.sectionTitle}>What you can do</h3>
          <div style={panelStyles.featureList}>
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} style={panelStyles.featureRow}>
                  <div style={{ ...panelStyles.featureIcon, backgroundColor: f.bg }}>
                    <Icon size={18} style={{ color: f.color }} />
                  </div>
                  <div style={panelStyles.featureText}>
                    <span style={panelStyles.featureTitle}>{f.title}</span>
                    <span style={panelStyles.featureDesc}>{f.desc}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Comparison */}
          <h3 style={{ ...panelStyles.sectionTitle, marginTop: '24px' }}>TreasureTrail vs eBay / Facebook Marketplace</h3>
          <div style={panelStyles.comparisonCard}>
            <div style={panelStyles.comparisonHeader}>
              <span style={panelStyles.compColLabel}>Feature</span>
              <span style={{ ...panelStyles.compColLabel, color: 'var(--color-primary-700)' }}>TreasureTrail</span>
              <span style={{ ...panelStyles.compColLabel, color: 'var(--color-neutral-400)' }}>eBay / FB</span>
            </div>
            {COMPARISONS.map((row, i) => (
              <div key={row.feature} style={{ ...panelStyles.compRow, ...(i % 2 === 0 ? panelStyles.compRowAlt : {}) }}>
                <div style={panelStyles.compFeature}>
                  <ChevronRight size={12} style={{ color: 'var(--color-primary-400)', flexShrink: 0 }} />
                  <span style={panelStyles.compFeatureLabel}>{row.feature}</span>
                </div>
                <span style={panelStyles.compTT}>{row.tt}</span>
                <span style={panelStyles.compOther}>{row.others}</span>
              </div>
            ))}
          </div>

          {/* Tagline */}
          <div style={panelStyles.tagline}>
            <TrendingUp size={16} style={{ color: 'var(--color-primary-500)' }} />
            <p style={panelStyles.taglineText}>Not just a marketplace — a hunting ground.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const panelStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'flex-end',
  },
  sheet: {
    width: '100%',
    maxHeight: '92vh',
    backgroundColor: 'var(--color-neutral-0)',
    borderRadius: '20px 20px 0 0',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    animation: 'slideUp 0.3s ease',
  },
  handle: {
    width: '36px',
    height: '4px',
    borderRadius: '2px',
    backgroundColor: 'var(--color-neutral-200)',
    margin: '10px auto 0',
    flexShrink: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: '16px 20px 12px',
    borderBottom: '1px solid var(--color-neutral-100)',
    flexShrink: 0,
  },
  title: {
    fontSize: 'var(--font-size-lg)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
    marginBottom: '2px',
  },
  subtitle: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-500)',
  },
  closeBtn: {
    width: '32px',
    height: '32px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-100)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  body: {
    flex: 1,
    overflow: 'auto',
    padding: '16px 20px 32px',
  },
  introBanner: {
    backgroundColor: 'var(--color-primary-50)',
    border: '1px solid var(--color-primary-100)',
    borderRadius: 'var(--radius-md)',
    padding: '12px 14px',
    marginBottom: '20px',
  },
  introText: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-700)',
    lineHeight: '1.55',
  },
  sectionTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-500)',
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    marginBottom: '12px',
  },
  featureList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  featureRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  },
  featureIcon: {
    width: '38px',
    height: '38px',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  featureText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flex: 1,
    paddingTop: '2px',
  },
  featureTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
  },
  featureDesc: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
    lineHeight: '1.45',
  },
  comparisonCard: {
    border: '1px solid var(--color-neutral-150)',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
  },
  comparisonHeader: {
    display: 'grid',
    gridTemplateColumns: '1fr 1.4fr 1.4fr',
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: 'var(--color-neutral-50)',
    borderBottom: '1px solid var(--color-neutral-100)',
  },
  compColLabel: {
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--color-neutral-500)',
  },
  compRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1.4fr 1.4fr',
    gap: '8px',
    padding: '10px 12px',
    borderBottom: '1px solid var(--color-neutral-100)',
    alignItems: 'start',
  },
  compRowAlt: {
    backgroundColor: 'var(--color-neutral-50)',
  },
  compFeature: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '4px',
    paddingTop: '1px',
  },
  compFeatureLabel: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-700)',
    lineHeight: '1.4',
  },
  compTT: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-primary-700)',
    lineHeight: '1.4',
  },
  compOther: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
    lineHeight: '1.4',
  },
  tagline: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    marginTop: '20px',
    padding: '12px',
    borderRadius: 'var(--radius-md)',
    background: 'linear-gradient(135deg, var(--color-primary-50), var(--color-accent-50))',
    border: '1px solid var(--color-primary-100)',
  },
  taglineText: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-primary-700)',
    fontStyle: 'italic',
  },
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 24px',
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-700)',
    marginBottom: '4px',
  },
  emptyText: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-400)',
    marginBottom: '16px',
  },
  emptyBtn: {
    padding: '10px 20px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-600)',
    color: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
    cursor: 'pointer',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4) var(--space-4)',
    height: 'var(--header-height)',
    backgroundColor: 'var(--color-neutral-0)',
    borderBottom: '1px solid var(--color-neutral-100)',
    flexShrink: 0,
  },
  headerActions: {
    display: 'flex',
    gap: 'var(--space-3)',
    alignItems: 'center',
  },
  infoBtn: {
    width: '32px',
    height: '32px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-100)',
    border: '1px solid var(--color-neutral-200)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveBtn: {
    width: '32px',
    height: '32px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-error-50)',
    border: '1px solid var(--color-error-200)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  communityBtn: {
    width: '32px',
    height: '32px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-secondary-50)',
    border: '1px solid var(--color-secondary-200)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventsBtn: {
    width: '32px',
    height: '32px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-success-50)',
    border: '1px solid var(--color-success-200)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  marketBtn: {
    width: '32px',
    height: '32px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent-50)',
    border: '1px solid var(--color-accent-200)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapBtn: {
    width: '32px',
    height: '32px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-secondary-50)',
    border: '1px solid var(--color-secondary-200)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  proBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    padding: 'var(--space-1) var(--space-2)',
    borderRadius: 'var(--radius-full)',
    background: 'linear-gradient(135deg, var(--color-primary-50), var(--color-accent-50))',
    border: '1px solid var(--color-primary-200)',
  },
  proBtnText: {
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-primary-700)',
  },
  auctionBtn: {
    width: '32px',
    height: '32px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-50)',
    border: '1px solid var(--color-primary-200)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categories: {
    display: 'flex',
    gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-4)',
    overflowX: 'auto',
    flexShrink: 0,
    backgroundColor: 'var(--color-neutral-0)',
  },
  filterRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: '0 var(--space-4) var(--space-3)',
    flexShrink: 0,
    backgroundColor: 'var(--color-neutral-0)',
    borderBottom: '1px solid var(--color-neutral-100)',
  },
  searchRow: {
    display: 'flex',
    padding: '0 var(--space-4) var(--space-2)',
    flexShrink: 0,
    backgroundColor: 'var(--color-neutral-0)',
  },
  searchField: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-50)',
    border: '1px solid var(--color-neutral-150)',
  },
  locationField: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 10px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-50)',
    border: '1px solid var(--color-neutral-150)',
  },
  locationInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-800)',
    minWidth: 0,
  },
  locationClear: {
    width: 18,
    height: 18,
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-200)',
    color: 'var(--color-neutral-600)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  onboardCard: {
    display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
    margin: '0 var(--space-4) var(--space-3)',
    padding: 'var(--space-3) var(--space-4)',
    backgroundColor: 'var(--color-primary-50)',
    border: '1px solid var(--color-primary-100)',
    borderRadius: 'var(--radius-lg)',
  },
  onboardHeader: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' },
  onboardTitle: { flex: 1, fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-neutral-900)' },
  onboardDismiss: {
    width: 28, height: 28, borderRadius: 'var(--radius-md)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'transparent', border: 'none', color: 'var(--color-neutral-500)', cursor: 'pointer',
  },
  onboardList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  onboardItem: { display: 'flex', alignItems: 'center', gap: 10, minHeight: 36 },
  onboardCheckOn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 22, height: 22, borderRadius: '50%',
    backgroundColor: 'var(--color-primary-500)', color: '#fff',
    fontSize: 12, fontWeight: 700,
  },
  onboardCheckOff: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 22, height: 22, borderRadius: '50%',
    backgroundColor: 'var(--color-neutral-0)', color: 'var(--color-neutral-500)',
    border: '1px solid var(--color-neutral-200)',
    fontSize: 12, fontWeight: 700,
  },
  onboardLink: {
    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    color: 'var(--color-neutral-800)', fontSize: 'var(--font-size-sm)', fontWeight: 500,
    textAlign: 'left',
  },
  highlightBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    margin: 'var(--space-2) var(--space-4)',
    padding: '8px 12px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-primary-50)',
    border: '1px solid var(--color-primary-200)',
    flexShrink: 0,
  },
  highlightBannerText: {
    flex: 1,
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-primary-700)',
    fontWeight: 'var(--font-weight-medium)',
  },
  highlightBannerBtn: {
    padding: '4px 10px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-600)',
    color: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  sortSelect: {
    padding: '6px 10px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-50)',
    border: '1px solid var(--color-neutral-150)',
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-700)',
    cursor: 'pointer',
  },
  categoryChip: {
    padding: 'var(--space-2) var(--space-4)',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
    whiteSpace: 'nowrap',
    backgroundColor: 'var(--color-neutral-100)',
    color: 'var(--color-neutral-600)',
    transition: 'all var(--transition-fast)',
    border: '1px solid transparent',
  },
  categoryChipActive: {
    backgroundColor: 'var(--color-primary-50)',
    color: 'var(--color-primary-700)',
    border: '1px solid var(--color-primary-200)',
  },
  feed: {
    flex: 1,
    overflow: 'auto',
    padding: 'var(--space-3)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
    paddingBottom: 'var(--space-4)',
  },
  card: {
    backgroundColor: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
    boxShadow: 'var(--shadow-md)',
    animation: 'slideUp 0.4s ease forwards',
    opacity: 0,
    animationFillMode: 'forwards',
    // CRITICAL: the feed wrapper is `display: flex; flex-direction: column`.
    // Flex children default to `flex-shrink: 1`, which means once total card
    // content exceeds the feed's available height, every card squashes
    // proportionally instead of the feed scrolling. Image-less cards
    // collapse to just their badge row (see HOME_FEED_LAYOUT_AUDIT.md).
    // Pinning shrink to 0 makes each card render at its natural height and
    // forces the feed's `overflow:auto` to actually take over.
    flexShrink: 0,
    width: '100%',
  },
  cardImageContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: '4/3',
    // minHeight is a guarantee: aspect-ratio alone can collapse to 0
    // when the fallback (no <img>) has no intrinsic size, which is why
    // image-less Flash Find cards previously rendered as flat bands
    // with only the "Found" badge. minHeight keeps the image area
    // visibly proportional even when src is null.
    minHeight: '220px',
    overflow: 'hidden',
    backgroundColor: 'var(--color-neutral-100)',
  },
  cardImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  hotBadge: {
    position: 'absolute',
    top: 'var(--space-3)',
    left: 'var(--space-3)',
    padding: '3px var(--space-2)',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--color-error-500)',
    color: 'white',
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
    letterSpacing: '0.5px',
  },
  priceBadge: {
    position: 'absolute',
    bottom: 'var(--space-3)',
    right: 'var(--space-3)',
    padding: 'var(--space-1) var(--space-3)',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    color: 'white',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-bold)',
    backdropFilter: 'blur(4px)',
  },
  cardContent: {
    padding: 'var(--space-3) var(--space-4) var(--space-4)',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-2)',
  },
  avatar: {
    width: '28px',
    height: '28px',
    borderRadius: 'var(--radius-full)',
    objectFit: 'cover',
  },
  cardMeta: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
  },
  username: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
  },
  timeAgo: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
  },
  categoryTag: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    padding: '2px var(--space-2)',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--color-secondary-50)',
    color: 'var(--color-secondary-700)',
  },
  cardTitle: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
    marginBottom: 'var(--space-3)',
    lineHeight: 'var(--line-height-tight)',
  },
  cardActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-4)',
  },
  actionBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    color: 'var(--color-neutral-500)',
    fontSize: 'var(--font-size-sm)',
    transition: 'color var(--transition-fast)',
    minHeight: '44px',
    minWidth: '44px',
    padding: '0 6px',
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
  },
  badgeStack: {
    position: 'absolute',
    top: 'var(--space-3)',
    left: 'var(--space-3)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
  },
  priceBadgeWrap: {
    position: 'absolute',
    bottom: 'var(--space-3)',
    left: 'var(--space-3)',
  },
  radarSection: {
    borderBottom: '1px solid var(--color-neutral-100)',
    backgroundColor: 'var(--color-neutral-0)',
    flexShrink: 0,
  },
  radarHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: '10px var(--space-4) 6px',
  },
  radarLiveDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-error-500)',
    boxShadow: '0 0 0 2px var(--color-error-100)',
    flexShrink: 0,
  },
  radarTitle: {
    flex: 1,
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-800)',
  },
  radarSeeAll: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-primary-600)',
  },
  radarScroll: {
    display: 'flex',
    gap: 'var(--space-3)',
    padding: '0 var(--space-4) 12px',
    overflowX: 'auto',
    scrollbarWidth: 'none',
  },
};

function TooltipBtn({ onClick, btnStyle, label, desc, children }: {
  onClick: () => void;
  btnStyle: React.CSSProperties;
  label: string;
  desc: string;
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => { onClick(); setVisible(false); }}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        onTouchStart={() => {
          if (timerRef.current) clearTimeout(timerRef.current);
          setVisible(true);
          timerRef.current = setTimeout(() => setVisible(false), 2000);
        }}
        style={btnStyle}
        aria-label={label}
      >
        {children}
      </button>
      {visible && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(100% + 7px)',
          right: 0,
          backgroundColor: 'rgba(15,15,15,0.92)',
          color: '#fff',
          borderRadius: '9px',
          padding: '8px 10px',
          width: '148px',
          zIndex: 500,
          pointerEvents: 'none',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}>
          <p style={{ fontSize: '11px', fontWeight: 700, marginBottom: '3px', lineHeight: 1.2 }}>{label}</p>
          <p style={{ fontSize: '10px', opacity: 0.75, lineHeight: 1.35 }}>{desc}</p>
          <div style={{ position: 'absolute', bottom: -4, right: 14, width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid rgba(15,15,15,0.92)' }} />
        </div>
      )}
    </div>
  );
}

function AuctionRadarCard({ listing, onClick }: { listing: ExternalListing; onClick: () => void }) {
  const color = PLATFORM_COLORS[listing.platform] ?? PLATFORM_COLORS.other;
  const platformLabel = listing.platform.charAt(0).toUpperCase() + listing.platform.slice(1);
  return (
    <button onClick={onClick} style={{
      flexShrink: 0,
      width: '120px',
      borderRadius: '10px',
      border: '1px solid var(--color-neutral-100)',
      backgroundColor: 'var(--color-neutral-0)',
      overflow: 'hidden',
      textAlign: 'left',
    }}>
      <div style={{ width: '100%', height: '72px', backgroundColor: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
        <ImageWithFade
          src={listing.image_url}
          alt={listing.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          fallback={<Gavel size={22} style={{ color }} />}
        />
        {listing.listing_type === 'live_stream' && (
          <div style={{ position: 'absolute', top: 4, left: 4 }}>
            <Badge variant="warning" style={{ backgroundColor: 'var(--color-error-500)', color: '#fff' }}>LIVE</Badge>
          </div>
        )}
      </div>
      <div style={{ padding: '6px 7px 7px' }}>
        <span style={{ display: 'inline-block', fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', backgroundColor: `${color}18`, color, marginBottom: '3px' }}>{platformLabel}</span>
        <p style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-neutral-800)', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{listing.title}</p>
        {listing.price_display && <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-success-700)', marginTop: '2px', display: 'block' }}>{listing.price_display}</span>}
      </div>
    </button>
  );
}

function ExternalListingCard({ listing, index, onClick }: { listing: ExternalListing; index: number; onClick: () => void }) {
  const color = PLATFORM_COLORS[listing.platform] ?? PLATFORM_COLORS.other;
  const platformLabel = listing.platform.charAt(0).toUpperCase() + listing.platform.slice(1);
  return (
    <article style={{ ...styles.card, animation: `fadeIn 0.3s ease ${index * 0.05}s both` }}>
      <div style={styles.cardHeader}>
        <div style={{ width: '28px', height: '28px', borderRadius: 'var(--radius-full)', backgroundColor: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Gavel size={13} style={{ color }} />
        </div>
        <div style={styles.cardMeta}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-800)' }}>{platformLabel}</span>
            <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', backgroundColor: `${color}18`, color }}>
              {listing.listing_type === 'live_stream' ? 'LIVE' : listing.listing_type.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </span>
          </div>
          {listing.category && (
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-400)' }}>{listing.category}</span>
          )}
        </div>
        {listing.price_display && (
          <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-success-700)' }}>{listing.price_display}</span>
        )}
      </div>

      <p style={styles.cardTitle}>{listing.title}</p>

      {listing.image_url && (
        <div style={styles.cardImage}>
          <ImageWithFade
            src={listing.image_url}
            alt={listing.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      )}

      <div style={{ ...styles.cardActions, paddingTop: 'var(--space-2)' }}>
        {listing.scout_needed && <Badge variant="scout">Scout Needed</Badge>}
        {listing.ships_available && <Badge variant="shipping">Ships</Badge>}
        <button onClick={onClick} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-primary-600)', fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>
          <ExternalLink size={12} />
          View
        </button>
      </div>
    </article>
  );
}
