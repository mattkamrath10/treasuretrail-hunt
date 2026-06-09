import { WANTED_CATEGORIES, type WantedCategory } from './wanted';
import { apiUrl } from './apiBase';
import { supabase } from './supabase';

/**
 * Wanted Wizard — Phase 2 category inference.
 *
 * Rule-based keyword matcher that guesses a `WantedCategory` from a free-text
 * search term and returns a confidence score in [0,1]. The wizard uses the
 * guess to auto-load that category's smart-question set; below the confidence
 * threshold it nudges the user to pick a category manually.
 *
 * The concrete matcher sits behind the `CategoryInferrer` interface so the
 * Phase 7 AI implementation can replace it WITHOUT changing any caller — the
 * interface is async-capable on purpose.
 */

export interface CategoryGuess {
  category: WantedCategory;
  /** 0 = no idea, 1 = certain. The wizard treats >= CONFIDENCE_THRESHOLD as
   *  "auto-load this category"; anything lower asks the user to confirm. */
  confidence: number;
}

export interface CategoryInferrer {
  infer(term: string): CategoryGuess | Promise<CategoryGuess>;
}

export const CONFIDENCE_THRESHOLD = 0.5;

// Keyword lists per category. Order matters only as a tie-breaker (earlier wins
// on an equal score). Keep these data-only — tuning inference is editing lists,
// never logic. Multi-word entries are matched as substrings; single words match
// either as a whole token (strong) or as a substring (weak).
const KEYWORDS: Partial<Record<WantedCategory, string[]>> = {
  cards: [
    'pokemon', 'pokémon', 'mtg', 'magic the gathering', 'yugioh', 'yu-gi-oh',
    'trading card', 'tcg', 'topps', 'panini', 'baseball card', 'football card',
    'booster', 'graded card', 'psa', 'sports card',
  ],
  music: [
    'vinyl', 'record', 'records', 'lp', 'turntable', 'guitar', 'bass', 'amp',
    'amplifier', 'drum', 'drums', 'piano', 'keyboard', 'synth', 'synthesizer',
    'violin', 'ukulele', 'cassette', 'album', 'vinyls',
  ],
  electronics: [
    'iphone', 'android', 'phone', 'laptop', 'macbook', 'ipad', 'tablet', 'tv',
    'television', 'monitor', 'camera', 'lens', 'console', 'playstation', 'ps5',
    'xbox', 'nintendo', 'switch', 'headphones', 'earbuds', 'speaker', 'drone',
    'gpu', 'graphics card', 'computer', 'pc',
  ],
  furniture: [
    'sofa', 'couch', 'table', 'chair', 'desk', 'dresser', 'cabinet',
    'bookshelf', 'shelf', 'bed', 'nightstand', 'wardrobe', 'stool', 'bench',
    'sideboard', 'armchair',
  ],
  jewelry: [
    'ring', 'necklace', 'bracelet', 'watch', 'rolex', 'diamond', 'earrings',
    'pendant', 'brooch', 'gemstone', 'engagement ring',
  ],
  art: [
    'painting', 'print', 'sculpture', 'poster', 'canvas', 'artwork', 'lithograph',
    'etching', 'photograph print', 'wall art',
  ],
  fashion: [
    'jacket', 'shoes', 'sneakers', 'dress', 'handbag', 'purse', 'denim', 'jeans',
    'boots', 'coat', 'hat', 'hoodie', 'sweater', 'designer bag', 'heels',
  ],
  toys: [
    'lego', 'action figure', 'funko', 'doll', 'toy', 'plush', 'model kit',
    'hot wheels', 'transformers', 'nerf', 'figurine', 'building set',
  ],
  tools: [
    'drill', 'saw', 'wrench', 'hammer', 'tool', 'tools', 'dewalt', 'milwaukee',
    'makita', 'sander', 'grinder', 'lathe', 'toolbox', 'air compressor',
  ],
  books: [
    'book', 'books', 'novel', 'comic', 'comics', 'manga', 'first edition',
    'textbook', 'magazine', 'hardcover', 'paperback', 'graphic novel',
  ],
  sports: [
    'bike', 'bicycle', 'golf', 'ski', 'skis', 'snowboard', 'skateboard',
    'tennis', 'fishing', 'kayak', 'dumbbell', 'weights', 'treadmill', 'helmet',
    'cleats', 'racket',
  ],
  home: [
    'kitchen', 'blender', 'mixer', 'cookware', 'pan', 'pot', 'knife set',
    'vacuum', 'appliance', 'espresso', 'coffee maker', 'air fryer', 'toaster',
    'cutlery', 'dishes',
  ],
  collectibles: [
    'coin', 'coins', 'stamp', 'stamps', 'antique', 'memorabilia', 'autograph',
    'collectible', 'collectibles', 'figure', 'vintage toy', 'rare',
  ],
  vintage: [
    'vintage', 'retro', 'mid century', 'midcentury', 'antique', 'classic',
  ],
};

function normalize(term: string): { lower: string; tokens: string[] } {
  const lower = term.toLowerCase().trim();
  const tokens = lower.split(/[^a-z0-9]+/i).filter(Boolean);
  return { lower, tokens };
}

/**
 * Rule-based inference. Each matched keyword scores: a whole-token match counts
 * strong (2), a substring/phrase match counts weak (1). The highest-scoring
 * category wins; confidence scales with the score and whether any strong match
 * was found. No match → `other` with confidence 0 (the wizard then asks).
 */
function ruleBasedInfer(term: string): CategoryGuess {
  const { lower, tokens } = normalize(term);
  if (!lower) return { category: 'other', confidence: 0 };

  const tokenSet = new Set(tokens);
  let best: WantedCategory = 'other';
  let bestScore = 0;
  let bestStrong = false;

  for (const [cat, words] of Object.entries(KEYWORDS) as [WantedCategory, string[]][]) {
    let score = 0;
    let strong = false;
    for (const kw of words) {
      if (kw.includes(' ')) {
        if (lower.includes(kw)) {
          score += 2; // multi-word phrase = strong signal
          strong = true;
        }
      } else if (tokenSet.has(kw)) {
        score += 2;
        strong = true;
      } else if (lower.includes(kw)) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = cat;
      bestStrong = strong;
    }
  }

  if (bestScore === 0) return { category: 'other', confidence: 0 };

  // Strong (whole-token/phrase) hits clear the threshold; weak-only hits land
  // just under it so the wizard surfaces the picker rather than guessing.
  const confidence = bestStrong
    ? Math.min(1, 0.7 + 0.1 * (bestScore - 2))
    : Math.min(0.45, 0.3 + 0.05 * bestScore);

  return { category: best, confidence };
}

export const ruleBasedInferrer: CategoryInferrer = { infer: ruleBasedInfer };

// ---- Phase 7: AI-backed inference (server-proxied, rule-based fallback) -----

const VALID_CATEGORIES = new Set<WantedCategory>(WANTED_CATEGORIES);
const AI_INFER_TIMEOUT_MS = 4000;
// Per-session memo so repeating a term (or re-opening the wizard) never re-hits
// the endpoint. The server keeps its own cross-user cache too.
const aiInferCache = new Map<string, CategoryGuess>();

async function bearerHeader(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

/**
 * AI category inference via the server (the key stays server-side). Falls back
 * to the rule-based guess on ANY error, timeout, missing auth, invalid output,
 * or when the AI is less confident than the keyword matcher — so the wizard is
 * never worse off than Phase 2 and is never blocked.
 */
async function aiInfer(term: string): Promise<CategoryGuess> {
  const fallback = ruleBasedInfer(term);
  const clean = term.trim();
  if (clean.length < 2) return fallback;

  const cacheKey = clean.toLowerCase();
  const hit = aiInferCache.get(cacheKey);
  if (hit) return hit;

  try {
    const headers = await bearerHeader();
    if (!headers.Authorization) return fallback;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), AI_INFER_TIMEOUT_MS);
    const res = await fetch(apiUrl('/api/wanted/infer-category'), {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ term: clean }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));

    if (!res.ok) return fallback;
    const body = (await res.json().catch(() => null)) as
      | { category?: string; confidence?: number; fallback?: boolean }
      | null;
    if (!body || body.fallback) return fallback;

    const category = body.category as WantedCategory;
    const confidence = Number(body.confidence);
    if (!VALID_CATEGORIES.has(category) || !Number.isFinite(confidence)) return fallback;

    const ai: CategoryGuess = { category, confidence: Math.max(0, Math.min(1, confidence)) };
    // Prefer the AI guess when it clears the threshold or is at least as
    // confident as the keyword matcher; otherwise keep the rule-based guess.
    const chosen =
      ai.confidence >= CONFIDENCE_THRESHOLD || ai.confidence >= fallback.confidence ? ai : fallback;
    aiInferCache.set(cacheKey, chosen);
    return chosen;
  } catch {
    return fallback;
  }
}

export const aiInferrer: CategoryInferrer = { infer: aiInfer };

/**
 * The inferrer the app actually uses. Phase 7 swaps in the AI-backed inferrer;
 * because it resolves through the async `CategoryInferrer` interface and always
 * falls back to `ruleBasedInfer`, callers (the wizard) need no changes.
 */
export const activeInferrer: CategoryInferrer = aiInferrer;

/** Sync convenience wrapper around the rule-based inferrer. */
export function inferCategory(term: string): CategoryGuess {
  return ruleBasedInfer(term);
}
