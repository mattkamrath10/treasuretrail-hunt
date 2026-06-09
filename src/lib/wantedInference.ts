import type { WantedCategory } from './wanted';

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

/**
 * The inferrer the app actually uses. Swapping this for an async AI-backed
 * implementation in Phase 7 requires NO caller changes — callers (the wizard)
 * resolve `infer()` through `Promise.resolve(...)`, so a sync or async inferrer
 * both work unchanged.
 */
export const activeInferrer: CategoryInferrer = ruleBasedInferrer;

/** Sync convenience wrapper around the rule-based inferrer. */
export function inferCategory(term: string): CategoryGuess {
  return ruleBasedInfer(term);
}
