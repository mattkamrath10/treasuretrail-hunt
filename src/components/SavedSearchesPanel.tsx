import { useEffect, useState, type CSSProperties } from 'react';
import { X, Bookmark, Trash2, Play, Loader } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  createSavedSearch,
  deleteSavedSearch,
  listSavedSearches,
  type SavedSearch,
  type SavedSearchInput,
} from '../lib/savedSearches';

type Props = {
  open: boolean;
  onClose: () => void;
  /** When user clicks "Run", apply this search back to the host page. */
  onRun: (search: SavedSearch) => void;
  /** Current draft to optionally save (typically the active query/filters). */
  draft?: SavedSearchInput;
};

export default function SavedSearchesPanel({ open, onClose, onRun, draft }: Props) {
  const { user } = useAuth();
  const [items, setItems] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    if (!open || !user) return;
    setLoading(true);
    listSavedSearches(user.id).then((rows) => {
      setItems(rows);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [open, user]);

  if (!open) return null;

  const canSave = !!user && !!draft && (
    (draft.keywords && draft.keywords.trim().length > 0) ||
    (draft.categories && draft.categories.length > 0) ||
    (draft.marketplaces && draft.marketplaces.length > 0) ||
    (draft.location_text && draft.location_text.length > 0)
  );

  const handleSave = async () => {
    if (!user || !draft) return;
    setSaving(true);
    const { data } = await createSavedSearch(user.id, { ...draft, name: name.trim() || draft.name || draft.keywords });
    setSaving(false);
    setName('');
    if (data) setItems((cur) => [data, ...cur]);
  };

  const handleDelete = async (id: string) => {
    await deleteSavedSearch(id);
    setItems((cur) => cur.filter((s) => s.id !== id));
  };

  return (
    <div onClick={onClose} role="dialog" aria-modal="true" style={s.backdrop}>
      <div onClick={(e) => e.stopPropagation()} style={s.sheet}>
        <header style={s.header}>
          <div style={s.titleRow}>
            <Bookmark size={18} style={{ color: 'var(--color-primary-600)' }} />
            <h2 style={s.title}>Saved Searches</h2>
          </div>
          <button onClick={onClose} aria-label="Close" style={s.closeBtn}>
            <X size={18} />
          </button>
        </header>

        {canSave && (
          <div style={s.saveRow}>
            <input
              placeholder={(draft?.keywords || 'Name this search')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={s.nameInput}
            />
            <button onClick={handleSave} disabled={saving} style={s.saveBtn}>
              {saving ? <Loader size={14} /> : 'Save current'}
            </button>
          </div>
        )}

        <div style={s.list}>
          {loading ? (
            <div style={s.empty}>Loading…</div>
          ) : items.length === 0 ? (
            <div style={s.empty}>
              {user
                ? 'No saved searches yet. Search for something then tap "Save current".'
                : 'Sign in to save searches and get alerts when new matches appear.'}
            </div>
          ) : (
            items.map((it) => {
              const summary = [
                it.categories.length > 0 ? it.categories.join(', ') : null,
                it.marketplaces.length > 0 ? it.marketplaces.join(', ') : null,
                it.location_text || null,
              ].filter(Boolean).join(' · ');
              return (
                <div key={it.id} style={s.row}>
                  <div style={s.rowMain}>
                    <span style={s.rowName}>{it.name || it.keywords || 'Untitled'}</span>
                    {summary && <span style={s.rowSub}>{summary}</span>}
                  </div>
                  <div style={s.rowActions}>
                    <button onClick={() => onRun(it)} aria-label="Run search" style={s.iconBtn}>
                      <Play size={16} style={{ color: 'var(--color-primary-600)' }} />
                    </button>
                    <button onClick={() => handleDelete(it.id)} aria-label="Delete saved search" style={s.iconBtn}>
                      <Trash2 size={16} style={{ color: 'var(--color-error-500)' }} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  backdrop: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    zIndex: 1100, padding: 'var(--space-3)',
  },
  sheet: {
    backgroundColor: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-lg)',
    width: '100%', maxWidth: 480, maxHeight: '85vh',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: 'var(--space-3) var(--space-4)',
    borderBottom: '1px solid var(--color-neutral-100)',
  },
  titleRow: { display: 'flex', alignItems: 'center', gap: 8 },
  title: { fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--color-neutral-900)' },
  closeBtn: {
    minWidth: 44, minHeight: 44, width: 44, height: 44, borderRadius: '50%',
    backgroundColor: 'transparent', border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  saveRow: {
    display: 'flex', gap: 8, padding: 'var(--space-3) var(--space-4)',
    borderBottom: '1px solid var(--color-neutral-50)',
  },
  nameInput: {
    flex: 1, minHeight: 44, padding: '0 12px',
    border: '1px solid var(--color-neutral-200)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-sm)',
  },
  saveBtn: {
    minHeight: 44, padding: '0 14px',
    backgroundColor: 'var(--color-primary-500)', color: '#fff',
    border: 'none', borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer',
  },
  list: { flex: 1, overflowY: 'auto', padding: 'var(--space-2) var(--space-3)' },
  empty: {
    padding: 'var(--space-6) var(--space-4)', textAlign: 'center',
    fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-500)', lineHeight: 1.4,
  },
  row: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: 'var(--space-3)', borderBottom: '1px solid var(--color-neutral-50)',
  },
  rowMain: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  rowName: { fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-neutral-900)' },
  rowSub: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)' },
  rowActions: { display: 'flex', gap: 4 },
  iconBtn: {
    minWidth: 44, minHeight: 44, width: 44, height: 44, borderRadius: '50%',
    backgroundColor: 'transparent', border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
};
