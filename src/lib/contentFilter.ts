/**
 * Lightweight client-side content filter (Apple Guideline 1.2 — a method for
 * filtering objectionable content).
 *
 * This blocks publishing of content containing profanity, hate speech, threats,
 * or explicit sexual language. It is a first-line filter applied at the create
 * surfaces (listings, finds/community posts, events, messages). It is
 * deliberately conservative (word-boundary matching on a curated list) to keep
 * false positives low; server-side moderation + user reports (content_reports)
 * provide the second line of defense.
 */

export const GUIDELINE_MESSAGE =
  'This content violates the TreasureTrail Community Guidelines and cannot be posted.';

// Curated list of disallowed terms (profanity, slurs, threats, explicit).
// Multi-word entries are matched as substrings; single words match on
// word boundaries to avoid catching innocent substrings (e.g. "assist").
const BLOCKED_TERMS: string[] = [
  'fuck',
  'fucking',
  'motherfucker',
  'shit',
  'bullshit',
  'asshole',
  'bitch',
  'bastard',
  'cunt',
  'dick',
  'pussy',
  'cock',
  'whore',
  'slut',
  'faggot',
  'fag',
  'nigger',
  'nigga',
  'retard',
  'retarded',
  'kike',
  'spic',
  'chink',
  'tranny',
  'rape',
  'rapist',
  'molest',
  'pedophile',
  'kill yourself',
  'kys',
  'i will kill you',
  'i will hurt you',
  'child porn',
  'cp for sale',
  'jailbait',
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface FilterResult {
  blocked: boolean;
  term?: string;
}

export function containsObjectionable(
  text: string | null | undefined,
): FilterResult {
  if (!text) return { blocked: false };
  const norm = normalize(text);
  if (!norm) return { blocked: false };
  const words = new Set(norm.split(' '));
  for (const term of BLOCKED_TERMS) {
    if (term.includes(' ')) {
      if (norm.includes(term)) return { blocked: true, term };
    } else if (words.has(term)) {
      return { blocked: true, term };
    }
  }
  return { blocked: false };
}

/**
 * Returns blocked:true if ANY of the provided text fields is objectionable.
 * Convenience for create flows that validate several fields (title + body).
 */
export function assertClean(
  ...texts: Array<string | null | undefined>
): FilterResult {
  for (const t of texts) {
    const r = containsObjectionable(t);
    if (r.blocked) return r;
  }
  return { blocked: false };
}
