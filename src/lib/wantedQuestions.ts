import type { WantedCategory } from './wanted';
import { apiUrl } from './apiBase';
import { supabase } from './supabase';

/**
 * Wanted Wizard — Phase 2 question-set config.
 *
 * The single source of truth mapping each `WantedCategory` to an ordered set of
 * smart questions (<= 5 each). The wizard engine renders these generically, so
 * adding/adjusting a category is a DATA-ONLY change here — no engine edits.
 *
 * The universal location step (city / region / travel distance) is appended by
 * the engine itself and is NOT part of these sets.
 */

export type QuestionKind = 'text' | 'number' | 'single';

export interface QuestionOption {
  value: string;
  label: string;
}

export interface WizardQuestion {
  /** Stable key for the collected-answers map. */
  id: string;
  kind: QuestionKind;
  /** Step heading shown above the control. */
  prompt: string;
  /** Short label used when folding the answer into the request description. */
  summary: string;
  /** Optional field label above the control. */
  label?: string;
  placeholder?: string;
  /** Options for `single`. */
  options?: QuestionOption[];
  /** Most smart questions are optional; the engine still requires a valid title. */
  optional?: boolean;
  /** Special-cased fields lifted out of the description into payload columns. */
  maps?: 'budget';
  inputMode?: 'decimal' | 'text';
}

// ---- Reusable question builders -------------------------------------------

const conditionQ: WizardQuestion = {
  id: 'condition',
  kind: 'single',
  prompt: 'What condition are you after?',
  summary: 'Condition',
  optional: true,
  options: [
    { value: 'any', label: 'Any' },
    { value: 'new', label: 'New' },
    { value: 'used', label: 'Used' },
    { value: 'vintage', label: 'Vintage' },
  ],
};

const budgetQ: WizardQuestion = {
  id: 'budget',
  kind: 'number',
  prompt: "What's your max budget?",
  summary: 'Budget',
  label: 'Max budget ($)',
  placeholder: 'Optional',
  optional: true,
  maps: 'budget',
  inputMode: 'decimal',
};

const detailsQ = (placeholder: string): WizardQuestion => ({
  id: 'details',
  kind: 'text',
  prompt: 'Anything else?',
  summary: 'Details',
  label: 'Notes for sellers',
  placeholder,
  optional: true,
});

const single = (
  id: string,
  prompt: string,
  summary: string,
  options: string[],
): WizardQuestion => ({
  id,
  kind: 'single',
  prompt,
  summary,
  optional: true,
  options: options.map((o) => ({ value: o.toLowerCase().replace(/[^a-z0-9]+/g, '_'), label: o })),
});

const text = (id: string, prompt: string, summary: string, placeholder: string): WizardQuestion => ({
  id,
  kind: 'text',
  prompt,
  summary,
  label: summary,
  placeholder,
  optional: true,
});

// ---- Per-category sets (<= 5 questions each) ------------------------------

export const QUESTION_SETS: Record<WantedCategory, WizardQuestion[]> = {
  cards: [
    single('game', 'Which game or sport?', 'Game', ['Pokémon', 'Magic', 'Yu-Gi-Oh', 'Sports', 'Other']),
    single('grading', 'Graded or raw?', 'Grading', ['Either', 'Raw / ungraded', 'Graded (PSA/BGS)']),
    budgetQ,
    detailsQ('Set, card name, year, grade…'),
  ],
  music: [
    single('type', 'What kind of music item?', 'Type', ['Vinyl records', 'Instrument', 'Audio gear', 'CDs & tapes', 'Other']),
    text('brand', 'Brand or artist?', 'Brand / artist', 'e.g. Fender, The Beatles'),
    conditionQ,
    budgetQ,
    detailsQ('Model, pressing, era…'),
  ],
  electronics: [
    single('type', 'What type of device?', 'Type', ['Phone', 'Laptop', 'TV', 'Camera', 'Gaming', 'Audio', 'Other']),
    text('brand', 'Preferred brand?', 'Brand', 'e.g. Apple, Sony'),
    conditionQ,
    budgetQ,
    detailsQ('Model, specs, storage…'),
  ],
  furniture: [
    single('type', 'What kind of furniture?', 'Type', ['Seating', 'Table', 'Storage', 'Bed', 'Desk', 'Other']),
    text('style', 'Style or material?', 'Style / material', 'e.g. mid-century, solid oak'),
    budgetQ,
    detailsQ('Dimensions, color, brand…'),
  ],
  jewelry: [
    single('type', 'What kind of piece?', 'Type', ['Ring', 'Necklace', 'Bracelet', 'Watch', 'Earrings', 'Other']),
    single('material', 'Preferred material?', 'Material', ['Any', 'Gold', 'Silver', 'Platinum', 'Diamond']),
    budgetQ,
    detailsQ('Size, brand, gemstone…'),
  ],
  art: [
    single('type', 'What kind of art?', 'Type', ['Painting', 'Print', 'Sculpture', 'Photography', 'Other']),
    text('artist', 'Artist or style?', 'Artist / style', 'e.g. abstract, Banksy'),
    budgetQ,
    detailsQ('Size, medium, framing…'),
  ],
  fashion: [
    single('type', 'What are you after?', 'Type', ['Clothing', 'Shoes', 'Bags', 'Accessories', 'Other']),
    text('size', 'What size?', 'Size', 'e.g. M, US 10, 32W'),
    conditionQ,
    budgetQ,
    detailsQ('Brand, color, style…'),
  ],
  toys: [
    single('type', 'What kind of toy?', 'Type', ['LEGO', 'Action figures', 'Dolls', 'Models', 'Plush', 'Other']),
    text('brand', 'Brand or franchise?', 'Brand / franchise', 'e.g. Star Wars, Barbie'),
    conditionQ,
    budgetQ,
    detailsQ('Set number, year, edition…'),
  ],
  tools: [
    single('type', 'What kind of tool?', 'Type', ['Power tools', 'Hand tools', 'Garden', 'Automotive', 'Other']),
    text('brand', 'Preferred brand?', 'Brand', 'e.g. DeWalt, Makita'),
    conditionQ,
    budgetQ,
    detailsQ('Model, voltage, set…'),
  ],
  books: [
    single('type', 'What kind of book?', 'Type', ['Fiction', 'Non-fiction', 'Comics / manga', 'Textbooks', 'Other']),
    text('title', 'Title or author?', 'Title / author', 'e.g. Dune, Stephen King'),
    conditionQ,
    budgetQ,
    detailsQ('Edition, year, ISBN…'),
  ],
  sports: [
    single('type', 'What kind of gear?', 'Type', ['Bikes', 'Fitness', 'Outdoor', 'Team sports', 'Water sports', 'Other']),
    text('brand', 'Preferred brand?', 'Brand', 'e.g. Trek, Wilson'),
    conditionQ,
    budgetQ,
    detailsQ('Size, model, specs…'),
  ],
  home: [
    single('type', 'What kind of item?', 'Type', ['Appliances', 'Cookware', 'Decor', 'Storage', 'Other']),
    text('brand', 'Preferred brand?', 'Brand', 'e.g. KitchenAid, Le Creuset'),
    budgetQ,
    detailsQ('Model, color, size…'),
  ],
  collectibles: [
    single('type', 'What do you collect?', 'Type', ['Coins', 'Stamps', 'Memorabilia', 'Antiques', 'Autographs', 'Other']),
    text('era', 'Era or origin?', 'Era / origin', 'e.g. 1800s, WWII'),
    conditionQ,
    budgetQ,
    detailsQ('Maker, year, provenance…'),
  ],
  vintage: [
    text('item', 'What vintage item?', 'Item', 'e.g. lamp, typewriter'),
    single('era', 'Which era?', 'Era', ['Any', 'Pre-1950', '50s–60s', '70s–80s', '90s']),
    conditionQ,
    budgetQ,
    detailsQ('Maker, style, condition…'),
  ],
  other: [
    detailsQ('Describe what you are looking for in detail.'),
    conditionQ,
    budgetQ,
  ],
};

export function questionsFor(category: WantedCategory): WizardQuestion[] {
  return QUESTION_SETS[category] ?? QUESTION_SETS.other;
}

// ---- Phase 7: AI-generated question sets (server-proxied, static fallback) --

const AI_QUESTIONS_TIMEOUT_MS = 6000;
const QUESTION_KINDS = new Set<QuestionKind>(['text', 'number', 'single']);

const slug = (s: string): string =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/**
 * Validate/normalize one model-produced question to the WizardQuestion schema.
 * Returns null for anything malformed so it is dropped rather than rendered.
 * Every question is forced `optional` so AI output can never block submission.
 */
function sanitizeAiQuestion(raw: unknown, seen: Set<string>): WizardQuestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' ? slug(r.id) : '';
  let kind = (typeof r.kind === 'string' ? r.kind.trim().toLowerCase() : '') as QuestionKind;
  const prompt = typeof r.prompt === 'string' ? r.prompt.trim().slice(0, 160) : '';
  const summary = typeof r.summary === 'string' ? r.summary.trim().slice(0, 40) : '';
  if (!id || !QUESTION_KINDS.has(kind) || !prompt || !summary || seen.has(id)) return null;

  const q: WizardQuestion = { id, kind, prompt, summary, optional: true };
  if (typeof r.label === 'string' && r.label.trim()) q.label = r.label.trim().slice(0, 60);
  if (typeof r.placeholder === 'string' && r.placeholder.trim()) q.placeholder = r.placeholder.trim().slice(0, 80);

  if (r.maps === 'budget') {
    q.maps = 'budget';
    kind = 'number';
    q.kind = 'number';
    q.inputMode = 'decimal';
  } else if (r.inputMode === 'decimal' || r.inputMode === 'text') {
    q.inputMode = r.inputMode;
  }

  if (kind === 'single') {
    const rawOpts = Array.isArray(r.options) ? r.options : [];
    const options: QuestionOption[] = [];
    const optSeen = new Set<string>();
    for (const o of rawOpts) {
      if (!o || typeof o !== 'object') continue;
      const oo = o as Record<string, unknown>;
      const label = typeof oo.label === 'string' ? oo.label.trim().slice(0, 40) : '';
      let value = typeof oo.value === 'string' ? slug(oo.value) : '';
      if (!value && label) value = slug(label);
      if (!label || !value || optSeen.has(value)) continue;
      optSeen.add(value);
      options.push({ value, label });
      if (options.length >= 6) break;
    }
    if (options.length < 2) return null; // a single-choice needs real options
    q.options = options;
  }

  seen.add(id);
  return q;
}

function sanitizeAiQuestions(raw: unknown): WizardQuestion[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const out: WizardQuestion[] = [];
  for (const item of raw) {
    if (out.length >= 5) break;
    const q = sanitizeAiQuestion(item, seen);
    if (q) out.push(q);
  }
  return out.length ? out : null;
}

/**
 * AI-generated question set for an item + category, via the server (the key
 * stays server-side). Validated to the WizardQuestion schema and bounded by a
 * timeout; falls back to the static `questionsFor(category)` set on ANY error,
 * timeout, missing auth, or invalid output — so the wizard never blocks and is
 * never worse than the Phase 2 config.
 */
export async function generateQuestions(
  term: string,
  category: WantedCategory,
): Promise<WizardQuestion[]> {
  const fallback = questionsFor(category);
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return fallback;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), AI_QUESTIONS_TIMEOUT_MS);
    const res = await fetch(apiUrl('/api/wanted/questions'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ term: term.trim(), category }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));

    if (!res.ok) return fallback;
    const body = (await res.json().catch(() => null)) as
      | { questions?: unknown; fallback?: boolean }
      | null;
    if (!body || body.fallback) return fallback;

    const qs = sanitizeAiQuestions(body.questions);
    return qs && qs.length ? qs : fallback;
  } catch {
    return fallback;
  }
}
