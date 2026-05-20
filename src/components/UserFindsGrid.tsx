import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { supabase } from '../lib/supabase';

type FindRow = {
  id: string;
  caption: string | null;
  image_url: string | null;
  type: string | null;
  created_at: string;
};

/**
 * Grid of a user's community_posts ("Finds"), used on both the owner's
 * Profile page (Activity tab) and PublicProfile. Each tile navigates to
 * the canonical /find/:id detail page. Empty + loading states are
 * inlined so callers can drop this in without scaffolding.
 *
 * We intentionally don't include marketplace_listings here — the
 * "Finds" stat on the profile header already sums both, but for the
 * grid the user mental model from the screenshot is the Flash Finds
 * feed, not the marketplace.
 */
export default function UserFindsGrid({ userId, emptyLabel }: { userId: string; emptyLabel?: string }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<FindRow[] | null>(null);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    // Reset to loading state on userId change so navigating between
    // profiles doesn't flash the previous user's finds while the new
    // query is in flight.
    setRows(null);
    setError(null);
    supabase
      .from('community_posts')
      .select('id, caption, image_url, type, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(60)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(err.message);
          setRows([]);
          return;
        }
        setRows((data ?? []) as FindRow[]);
      });
    return () => { cancelled = true; };
  }, [userId]);

  if (rows === null) {
    return (
      <div style={s.empty}>
        <div style={s.spinner} />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div style={s.empty}>
        <Upload size={28} style={{ color: 'var(--color-neutral-300)', marginBottom: 8 }} />
        <p style={s.emptyTitle}>{error ? "Couldn't load finds" : (emptyLabel || 'No finds yet')}</p>
        <p style={s.emptySub}>{error || 'Posted finds will appear here.'}</p>
      </div>
    );
  }

  return (
    <div style={s.grid}>
      {rows.map((r) => {
        const caption = (r.caption ?? '').trim() || 'Untitled Find';
        return (
          <button
            key={r.id}
            onClick={() => navigate(`/find/${r.id}`)}
            style={s.tile}
            aria-label={`Open ${caption}`}
          >
            {r.image_url ? (
              <img
                src={r.image_url}
                alt={caption}
                loading="lazy"
                decoding="async"
                style={s.tileImg}
              />
            ) : (
              <div style={s.tileFallback}>
                <Upload size={20} style={{ color: 'var(--color-neutral-400)' }} />
              </div>
            )}
            <span style={s.tileCaption}>{caption}</span>
          </button>
        );
      })}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 'var(--space-2)',
  },
  tile: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: 0,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
  },
  tileImg: {
    width: '100%',
    aspectRatio: '1 / 1',
    objectFit: 'cover',
    borderRadius: 'var(--radius-md)',
    background: 'var(--color-neutral-100)',
  },
  tileFallback: {
    width: '100%',
    aspectRatio: '1 / 1',
    borderRadius: 'var(--radius-md)',
    background: 'var(--color-neutral-100)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileCaption: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-700)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-8) var(--space-4)',
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 600,
    color: 'var(--color-neutral-700)',
    margin: 0,
  },
  emptySub: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
    margin: 0,
  },
  spinner: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    border: '3px solid var(--color-neutral-200)',
    borderTopColor: 'var(--color-primary-500)',
    animation: 'spin 0.8s linear infinite',
  },
};
