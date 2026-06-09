import type { WantedCategory } from './wanted';

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
