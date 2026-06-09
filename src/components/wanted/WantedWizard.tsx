import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { X, ArrowLeft } from 'lucide-react';
import { createWantedItem, WANTED_CATEGORY_LABEL, type WantedCategory } from '../../lib/wanted';
import { createSavedSearch } from '../../lib/savedSearches';
import { recordSearchDemand } from '../../lib/demand';
import { activeInferrer, CONFIDENCE_THRESHOLD, type CategoryGuess } from '../../lib/wantedInference';
import { questionsFor, generateQuestions, type WizardQuestion } from '../../lib/wantedQuestions';
import { useScrollLock } from '../../hooks/useScrollLock';

/**
 * WantedWizard — Phase 2 smart-question engine.
 *
 * Opened from the no-results search screen so a dead-end search becomes a rich
 * Wanted Request in a few taps. It seeds the search term as the title, INFERS a
 * likely category from that term (see wantedInference), and loads that
 * category's tailored question set (see wantedQuestions). When inference is
 * low-confidence it nudges the user to pick a category first; the category
 * picker is always one tap away and `other` is never a dead end.
 *
 * The screens are: item + category → the inferred category's questions →
 * a universal location step. Answers are folded onto the createWantedItem
 * payload (title / category / max_budget / location) with the rest serialized
 * into the description. On finish it also creates a saved search so the existing
 * notification infra alerts the requester on a match.
 *
 * Category detection and the question sets are config-driven so the Phase 7 AI
 * swap is a drop-in with no changes here.
 */

const CATEGORY_ENTRIES = Object.entries(WANTED_CATEGORY_LABEL) as [WantedCategory, string][];

// Travel radius (miles). `null` = Anywhere (no distance limit). Default 25.
const TRAVEL_OPTS: { label: string; value: number | null }[] = [
  { label: '10 mi', value: 10 },
  { label: '25 mi', value: 25 },
  { label: '50 mi', value: 50 },
  { label: '100 mi', value: 100 },
  { label: 'Anywhere', value: null },
];

type Answers = Record<string, string>;

interface Props {
  initialTerm: string;
  userId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}

export default function WantedWizard({ initialTerm, userId, onClose, onCreated }: Props) {
  useScrollLock(true);

  const [title, setTitle] = useState(initialTerm.trim());
  const [category, setCategory] = useState<WantedCategory>('other');
  const [categoryTouched, setCategoryTouched] = useState(false);
  // Inference is resolved through the async-capable interface so a Phase 7 AI
  // inferrer (which may be async) is a drop-in with no changes here.
  const [guess, setGuess] = useState<CategoryGuess | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [travelDistance, setTravelDistance] = useState<number | null>(25);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Resolve the category guess from the seed term once. Promise.resolve handles
  // both the sync rule-based inferrer and a future async AI one. Until the user
  // has manually picked, adopt the inferred category as the default.
  useEffect(() => {
    let cancelled = false;
    Promise.resolve(activeInferrer.infer(initialTerm)).then((g) => {
      if (cancelled) return;
      setGuess(g);
      setCategory((prev) => (categoryTouched ? prev : g.category));
    });
    return () => { cancelled = true; };
    // categoryTouched intentionally excluded — re-inferring on every pick would
    // fight the user's manual choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTerm]);

  // Low confidence => require an explicit category pick before proceeding.
  const lowConfidence = guess != null && guess.confidence < CONFIDENCE_THRESHOLD;
  const needsCategoryPick = lowConfidence && !categoryTouched;

  // The active category's question set drives the middle screens. It starts as
  // the static Phase 2 set (instant, never blocks) and is upgraded in-place to
  // an AI-tailored set when one arrives (Phase 7) — but only while the user is
  // still on the item step, so an async swap can never disrupt answers mid-flow.
  const [questions, setQuestions] = useState<WizardQuestion[]>(() => questionsFor(category));

  // Mirror the live step into a ref so the async AI upgrade can bail if the
  // user has already moved past the item screen by the time it resolves.
  const stepRef = useRef(step);
  useEffect(() => { stepRef.current = step; }, [step]);

  useEffect(() => {
    // Show the static set immediately, then try to upgrade to AI questions.
    setQuestions(questionsFor(category));
    let cancelled = false;
    void generateQuestions(title, category).then((qs) => {
      if (cancelled || stepRef.current !== 0) return;
      setQuestions(qs);
    });
    return () => { cancelled = true; };
    // `title` is read at fire time only — re-running on every keystroke would
    // spam the endpoint. Category changes (inference + manual picks) drive the
    // refetch; the static fallback covers the in-between.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // Screen 0 = item + category, screens 1..N = questions, last = location.
  const totalSteps = questions.length + 2;
  const isItemStep = step === 0;
  const isLocationStep = step === totalSteps - 1;
  const currentQuestion: WizardQuestion | null =
    !isItemStep && !isLocationStep ? questions[step - 1] : null;

  const titleValid = title.trim().length >= 2;

  const setAnswer = (id: string, value: string) =>
    setAnswers((a) => ({ ...a, [id]: value }));

  const budgetValid = (q: WizardQuestion): boolean => {
    if (q.maps !== 'budget') return true;
    const t = (answers[q.id] ?? '').trim();
    if (!t) return true;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0;
  };

  const next = () => {
    setErr(null);
    if (isItemStep && !titleValid) {
      setErr('Tell us what you are looking for (at least 2 characters).');
      return;
    }
    if (isItemStep && needsCategoryPick) {
      setErr('Pick a category so we can tailor the next questions.');
      return;
    }
    if (currentQuestion && !budgetValid(currentQuestion)) {
      setErr('Budget must be a number.');
      return;
    }
    setStep((st) => Math.min(totalSteps - 1, st + 1));
  };

  const back = () => {
    setErr(null);
    setStep((st) => Math.max(0, st - 1));
  };

  const pickCategory = (key: WantedCategory) => {
    setCategory(key);
    setCategoryTouched(true);
    // Reset answers tied to the previous category's questions so stale values
    // from a different set never leak into the new request.
    setAnswers({});
  };

  const buildDescription = (): { description: string; budget: number | null } => {
    let budget: number | null = null;
    const lines: string[] = [];
    for (const q of questions) {
      const raw = (answers[q.id] ?? '').trim();
      if (!raw) continue;
      if (q.maps === 'budget') {
        const n = Number(raw);
        if (Number.isFinite(n) && n >= 0) budget = n;
        continue;
      }
      let display = raw;
      if (q.kind === 'single' && q.options) {
        display = q.options.find((o) => o.value === raw)?.label ?? raw;
      }
      // The freeform "details" answer reads better on its own line.
      if (q.id === 'details') lines.push(display);
      else lines.push(`${q.summary}: ${display}`);
    }
    return { description: lines.join('\n'), budget };
  };

  const submit = async () => {
    setErr(null);
    if (!titleValid) { setStep(0); setErr('Tell us what you are looking for.'); return; }
    const badBudget = questions.find((q) => !budgetValid(q));
    if (badBudget) {
      setStep(questions.indexOf(badBudget) + 1);
      setErr('Budget must be a number.');
      return;
    }
    setSaving(true);
    try {
      const { description, budget } = buildDescription();
      const row = await createWantedItem(userId, {
        title: title.trim(),
        description,
        category,
        max_budget: budget,
        city: city.trim() || null,
        region: region.trim() || null,
        travel_distance: travelDistance,
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

      // Demand Intelligence (Phase 5): fold this request into aggregate demand
      // with its category + geocoded location (resolved on write). Best-effort.
      void recordSearchDemand(
        title.trim(),
        category,
        (row as { lat?: number | null }).lat ?? null,
        (row as { lng?: number | null }).lng ?? null,
      );

      onCreated(row.id);
    } catch (e: any) {
      setErr(`Couldn't create your request: ${e?.message ?? 'unknown error'}`);
      setSaving(false);
    }
  };

  const stepHeading = isItemStep
    ? 'What are you looking for?'
    : isLocationStep
      ? 'Where are you? (optional)'
      : currentQuestion?.prompt ?? '';

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
          {Array.from({ length: totalSteps }).map((_, i) => (
            <span key={i} style={{ ...s.dot, ...(i <= step ? s.dotActive : {}) }} />
          ))}
        </div>

        <div style={s.body} data-scroll-lock-allow>
          <p style={s.stepTitle}>{stepHeading}</p>

          {isItemStep && (
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
              {needsCategoryPick && (
                <p style={s.hint}>
                  Pick a category so we can tailor the next questions.
                </p>
              )}
              {guess != null && !lowConfidence && !categoryTouched && (
                <p style={s.hint}>
                  Tailored for <strong>{WANTED_CATEGORY_LABEL[category]}</strong> — tap to change.
                </p>
              )}
              <div style={s.chips}>
                {CATEGORY_ENTRIES.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => pickCategory(key)}
                    style={{ ...s.chip, ...(category === key ? s.chipActive : {}) }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}

          {currentQuestion && (
            <QuestionField
              q={currentQuestion}
              value={answers[currentQuestion.id] ?? ''}
              onChange={(v) => setAnswer(currentQuestion.id, v)}
            />
          )}

          {isLocationStep && (
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

              <label style={{ ...s.fieldLabel, marginTop: 16 }}>How far are you willing to travel?</label>
              <div style={s.chips}>
                {TRAVEL_OPTS.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setTravelDistance(opt.value)}
                    style={{ ...s.chip, ...(travelDistance === opt.value ? s.chipActive : {}) }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
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

          {!isLocationStep ? (
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

function QuestionField({
  q,
  value,
  onChange,
}: {
  q: WizardQuestion;
  value: string;
  onChange: (v: string) => void;
}) {
  if (q.kind === 'single') {
    return (
      <>
        {q.label && <label style={s.fieldLabel}>{q.label}</label>}
        <div style={s.chips}>
          {(q.options ?? []).map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(value === o.value ? '' : o.value)}
              style={{ ...s.chip, ...(value === o.value ? s.chipActive : {}) }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </>
    );
  }

  if (q.id === 'details') {
    return (
      <>
        {q.label && <label style={s.fieldLabel}>{q.label}</label>}
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={q.placeholder}
          style={{ ...s.input, height: 90, resize: 'vertical' }}
          maxLength={2000}
          autoFocus
        />
      </>
    );
  }

  return (
    <>
      {q.label && <label style={s.fieldLabel}>{q.label}</label>}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={q.placeholder}
        inputMode={q.inputMode}
        style={s.input}
        maxLength={q.kind === 'number' ? 12 : 120}
        autoFocus
      />
    </>
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
  hint: { margin: '0 0 10px', fontSize: 12.5, color: 'var(--color-neutral-500)', lineHeight: 1.5 },
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
