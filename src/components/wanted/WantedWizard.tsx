import { useMemo, useState, type CSSProperties } from 'react';
import { X, ArrowLeft } from 'lucide-react';
import { createWantedItem, WANTED_CATEGORY_LABEL, type WantedCategory } from '../../lib/wanted';
import { createSavedSearch } from '../../lib/savedSearches';
import { useScrollLock } from '../../hooks/useScrollLock';

/**
 * WantedWizard — Phase 1 basic flow.
 *
 * Opened from the no-results search screen so a dead-end search becomes a
 * Wanted Request in a few taps. It seeds the search term as the title and walks
 * through a small FIXED question set (item + category → preferences → location).
 * On finish it creates the wanted item AND wires it into the existing
 * notification infra by also creating a saved search, then hands the new id
 * back to the caller to navigate to the post.
 *
 * No category inference, travel distance, or AI yet — those are later phases.
 */

type Condition = 'any' | 'new' | 'used' | 'vintage';

const CONDITION_OPTS: { key: Condition; label: string }[] = [
  { key: 'any', label: 'Any condition' },
  { key: 'new', label: 'New' },
  { key: 'used', label: 'Used' },
  { key: 'vintage', label: 'Vintage' },
];

const CATEGORY_ENTRIES = Object.entries(WANTED_CATEGORY_LABEL) as [WantedCategory, string][];

const STEP_TITLES = ['What are you looking for?', 'Any preferences?', 'Where are you? (optional)'];

interface Props {
  initialTerm: string;
  userId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}

export default function WantedWizard({ initialTerm, userId, onClose, onCreated }: Props) {
  useScrollLock(true);

  const [step, setStep] = useState(0);
  const [title, setTitle] = useState(initialTerm.trim());
  const [category, setCategory] = useState<WantedCategory>('collectibles');
  const [condition, setCondition] = useState<Condition>('any');
  const [maxBudget, setMaxBudget] = useState('');
  const [details, setDetails] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const titleValid = title.trim().length >= 2;
  const budgetValid = useMemo(() => {
    const t = maxBudget.trim();
    if (!t) return true;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0;
  }, [maxBudget]);

  const next = () => {
    setErr(null);
    if (step === 0 && !titleValid) {
      setErr('Tell us what you are looking for (at least 2 characters).');
      return;
    }
    if (step === 1 && !budgetValid) {
      setErr('Budget must be a number.');
      return;
    }
    setStep((st) => Math.min(2, st + 1));
  };

  const back = () => {
    setErr(null);
    setStep((st) => Math.max(0, st - 1));
  };

  const submit = async () => {
    setErr(null);
    if (!titleValid) { setStep(0); setErr('Tell us what you are looking for.'); return; }
    if (!budgetValid) { setStep(1); setErr('Budget must be a number.'); return; }
    setSaving(true);
    try {
      const budget = maxBudget.trim() ? Number(maxBudget) : null;
      const conditionLabel = condition !== 'any'
        ? CONDITION_OPTS.find((c) => c.key === condition)?.label ?? null
        : null;
      const description = [conditionLabel ? `Condition: ${conditionLabel}` : '', details.trim()]
        .filter(Boolean)
        .join('\n');

      const row = await createWantedItem(userId, {
        title: title.trim(),
        description,
        category,
        max_budget: budget,
        city: city.trim() || null,
        region: region.trim() || null,
        source_search_term: initialTerm.trim() || null,
      });

      // Integrate with the existing notification infrastructure: set up a
      // saved search so the requester is alerted when a match is listed.
      // Best-effort — a failure here never blocks the created request.
      try {
        await createSavedSearch(userId, { keywords: title.trim(), name: title.trim() });
      } catch {
        /* noop */
      }

      onCreated(row.id);
    } catch (e: any) {
      setErr(`Couldn't create your request: ${e?.message ?? 'unknown error'}`);
      setSaving(false);
    }
  };

  return (
    <div
      className="tt-modal-overlay"
      style={s.overlay}
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div className="tt-sheet" style={s.sheet} role="dialog" aria-modal="true">
        <div style={s.handle} />

        <header style={s.header}>
          <h2 style={s.heading}>Create a wanted request</h2>
          <button onClick={onClose} disabled={saving} style={s.closeBtn} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div style={s.progress}>
          {STEP_TITLES.map((_, i) => (
            <span key={i} style={{ ...s.dot, ...(i <= step ? s.dotActive : {}) }} />
          ))}
        </div>

        <div style={s.body} data-scroll-lock-allow>
          <p style={s.stepTitle}>{STEP_TITLES[step]}</p>

          {step === 0 && (
            <>
              <label style={s.fieldLabel}>Item</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Vintage Pokémon cards"
                style={s.input}
                maxLength={120}
                autoFocus
              />
              <label style={{ ...s.fieldLabel, marginTop: 16 }}>Category</label>
              <div style={s.chips}>
                {CATEGORY_ENTRIES.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCategory(key)}
                    style={{ ...s.chip, ...(category === key ? s.chipActive : {}) }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <label style={s.fieldLabel}>Condition</label>
              <div style={s.chips}>
                {CONDITION_OPTS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCondition(c.key)}
                    style={{ ...s.chip, ...(condition === c.key ? s.chipActive : {}) }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              <label style={{ ...s.fieldLabel, marginTop: 16 }}>Max budget ($)</label>
              <input
                value={maxBudget}
                onChange={(e) => setMaxBudget(e.target.value)}
                placeholder="Optional"
                inputMode="decimal"
                style={s.input}
              />

              <label style={{ ...s.fieldLabel, marginTop: 16 }}>Anything else?</label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Brand, era, size — any specifics that help sellers find a match."
                style={{ ...s.input, height: 90, resize: 'vertical' }}
                maxLength={2000}
              />
            </>
          )}

          {step === 2 && (
            <>
              <p style={s.helper}>
                Adding your location helps nearby sellers find you. You can leave this blank.
              </p>
              <label style={s.fieldLabel}>City</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Optional"
                style={s.input}
              />
              <label style={{ ...s.fieldLabel, marginTop: 16 }}>State / region</label>
              <input
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="Optional"
                style={s.input}
              />
            </>
          )}

          {err && <p style={s.err}>{err}</p>}
        </div>

        <footer style={s.footer}>
          {step > 0 ? (
            <button onClick={back} disabled={saving} style={s.backBtn}>
              <ArrowLeft size={16} /> Back
            </button>
          ) : (
            <span style={{ flex: 1 }} />
          )}

          {step < 2 ? (
            <button onClick={next} style={s.nextBtn}>
              Next
            </button>
          ) : (
            <button onClick={submit} disabled={saving} style={s.nextBtn}>
              {saving ? 'Creating…' : 'Create request'}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    backgroundColor: 'rgba(0,0,0,0.45)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
  },
  sheet: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--color-surface, #fff)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    boxShadow: '0 -8px 30px rgba(0,0,0,0.18)',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'var(--color-neutral-300)',
    margin: '10px auto 4px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 16px 8px',
  },
  heading: { margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--color-neutral-900)' },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    border: 'none',
    background: 'var(--color-neutral-100)',
    color: 'var(--color-neutral-600)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  progress: { display: 'flex', gap: 6, padding: '0 16px 8px' },
  dot: { flex: 1, height: 4, borderRadius: 999, backgroundColor: 'var(--color-neutral-200)' },
  dotActive: { backgroundColor: 'var(--color-primary-600)' },
  body: { padding: '8px 16px 16px', overflowY: 'auto', WebkitOverflowScrolling: 'touch' },
  stepTitle: { margin: '4px 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--color-neutral-900)' },
  fieldLabel: {
    display: 'block',
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--color-neutral-500)',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  helper: { margin: '0 0 14px', fontSize: 13, color: 'var(--color-neutral-500)', lineHeight: 1.5 },
  input: {
    width: '100%',
    minHeight: 44,
    padding: '10px 12px',
    border: '1px solid var(--color-neutral-300)',
    borderRadius: 'var(--radius-md, 10px)',
    fontSize: 15,
    color: 'var(--color-neutral-900)',
    background: 'var(--color-surface, #fff)',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: {
    padding: '8px 12px',
    borderRadius: 999,
    border: '1px solid var(--color-neutral-300)',
    background: 'var(--color-surface, #fff)',
    color: 'var(--color-neutral-700)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  chipActive: {
    borderColor: 'var(--color-primary-600)',
    background: 'var(--color-primary-600)',
    color: '#fff',
  },
  err: {
    margin: '14px 0 0',
    padding: '10px 12px',
    background: 'rgba(239,68,68,0.10)',
    border: '1px solid rgba(239,68,68,0.30)',
    borderRadius: 10,
    color: '#b91c1c',
    fontSize: 12.5,
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 16px',
    borderTop: '1px solid var(--color-neutral-200)',
  },
  backBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '12px 16px',
    border: '1px solid var(--color-neutral-300)',
    borderRadius: 'var(--radius-lg, 14px)',
    background: 'var(--color-surface, #fff)',
    color: 'var(--color-neutral-700)',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
  },
  nextBtn: {
    flex: 1,
    minHeight: 48,
    padding: '13px 16px',
    border: 'none',
    borderRadius: 'var(--radius-lg, 14px)',
    background: 'var(--color-primary-600)',
    color: '#fff',
    fontWeight: 800,
    fontSize: 15,
    cursor: 'pointer',
  },
};
