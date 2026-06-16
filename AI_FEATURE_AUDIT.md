# TREASURETRAIL AI FEATURE AUDIT

_Audit date: June 16, 2026_

This report covers every feature in the TreasureTrail codebase that uses AI, LLMs,
computer vision, OCR, or any AI-assisted workflow. All AI runs **server-side** in
`server/index.ts` (a single Express server) and is called from the client over
`/api/*` routes. The AI provider is **OpenAI** via Replit's OpenAI integration.

---

## Summary

| # | Feature | Active | In Production | Visible in UI | Fully Functional |
|---|---------|:------:|:-------------:|:-------------:|:----------------:|
| 1 | AI Treasure Scan (photo → item ID + appraisal) | ✅ | ✅ | ✅ | ✅ |
| 2 | Wanted Request Wizard (AI category + smart questions) | ✅ | ✅ | ✅ | ✅ |
| 3 | Smart Screenshot Import (listing OCR/extraction) | ✅ | ✅ | ✅ | ⚠️ publish gated by flag |
| 4 | AI Event Import from URL | ✅ | ✅ | ✅ | ✅ |
| 5 | AI Business Card Import (vision OCR) | ✅ | ✅ | ✅ | ✅ |
| 6 | AI Business Import from URL (website / Facebook) | ✅ | ✅ | ✅ | ✅ (FB degrades) |

**Model used:** `gpt-5.4` (`server/index.ts`, `MODEL` constant).

**Shared API keys (all AI features):**
- `AI_INTEGRATIONS_OPENAI_API_KEY` + `AI_INTEGRATIONS_OPENAI_BASE_URL` — provided by the Replit OpenAI integration. The key never reaches the browser; all calls are server-side.
- Supporting (required for auth/logging on AI routes, not AI themselves): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

---

## 1. AI Treasure Scan — photo item identification & resale appraisal

1. **Feature name:** AI Treasure Scan (item identification, condition/rarity, value range, suggested price, keywords, selling tips).
2. **File locations:**
   - Server: `server/index.ts` — OpenAI client init (`~L46-49`), `SYSTEM_PROMPT` (`~L66-88`), `callOpenAIVision()` (`~L90-108`), `GET /api/ai-scan/usage` (`~L110-141`), `POST /api/ai-scan` (`~L143-259`); Supabase RPC `claim_ai_scan_slot` for atomic rate-limit slotting.
   - Client: `src/lib/aiAnalysis.ts` (API wrapper), `src/pages/FlashFinds.tsx` (UI).
3. **Currently active:** Yes.
4. **Connected to production:** Yes — served by the single Express server under `/api` in the Autoscale production deployment.
5. **Visible in UI:** Yes.
6. **How to access:** Bottom nav **Create (+)** → **Flash Find** → take/choose a photo → **AI Autofill** (Sparkles) button. Results populate an editable "AI Review" step before posting.
7. **Fully functional:** Yes. Returns structured JSON (title, category, brand, model, era, condition estimate, rarity 1–10, confidence, low/high value, suggested price, keywords, summary, highlights, selling tips, watch-outs).
8. **Errors / incomplete:** None notable. Robust: rate-limited (free = 5 / 24h, Pro = 100 / 24h soft cap via `/api/ai-scan/usage`); identical-image SHA-256 cache makes repeat scans free; the reserved usage slot is released/deleted if the AI call fails so the user isn't charged a scan; failure or limit nudges the user to manual entry.
9. **API keys required:** OpenAI integration keys (above) + Supabase keys for auth and the `ai_scans_log` table.
10. **Hidden in code, not exposed?** No — fully exposed.

---

## 2. Wanted Request Wizard — AI category inference + smart follow-up questions

1. **Feature name:** Wanted Request Wizard AI (classifies a free-text "wanted" term into a category and generates tailored follow-up questions).
2. **File locations:**
   - Server: `server/index.ts` — `callOpenAIJSON()` (`~L707-722`), `WANTED_CATEGORY_PROMPT` (`~L743`), `WANTED_QUESTIONS_PROMPT` (`~L749`), `POST /api/wanted/infer-category` (`~L759-787`), `sanitizeServerQuestions()` (`~L793`), `POST /api/wanted/questions` (`~L840-868`); in-memory TTL cache for common terms.
   - Client: `src/lib/wantedInference.ts` (`aiInferrer` / `activeInferrer`, `CONFIDENCE_THRESHOLD`), `src/lib/wantedQuestions.ts` (`generateQuestions` / `questionsFor`), `src/components/wanted/WantedWizard.tsx`; rendered from `src/pages/SearchResults.tsx`.
3. **Currently active:** Yes (`activeInferrer` defaults to `aiInferrer`).
4. **Connected to production:** Yes.
5. **Visible in UI:** Yes.
6. **How to access:** Run a global **Search**; on the results page the "Wanted Request" wizard CTA lets the user post what they're looking for. (Note: the dedicated **Wanted** bottom-nav tab was removed in a recent change — the wizard is now reached through Search and through Create → "Wanted post".)
7. **Fully functional:** Yes, with multi-layered graceful degradation.
8. **Errors / incomplete:** None — designed to never block the user. The server returns `{ fallback: true }` (HTTP 200) on any failure. Category inference falls back to a local rule-based keyword matcher when confidence is below threshold or AI fails; question generation falls back to a static per-category question set on failure/timeout. AI question output is sanitized/validated server-side and every question is forced optional.
9. **API keys required:** OpenAI integration keys.
10. **Hidden in code, not exposed?** No.

---

## 3. Smart Screenshot Import — listing OCR + AI extraction

1. **Feature name:** Smart Screenshot Import (reads a screenshot of any marketplace/auction listing and extracts a structured draft listing).
2. **File locations:**
   - Server: `server/index.ts` — `SMART_IMPORT_PROMPT` (`~L882-914`), `callOpenAISmartImport()` (`~L916-937`), `sanitizeImportedListing()` (`~L946`), `POST /api/import/screenshot` (`~L976-998`).
   - Client: `src/lib/screenshotImport.ts`, `src/pages/SmartScreenshotImport.tsx`.
3. **Currently active:** Yes (extraction). Publishing is gated by the `MARKETPLACE_CREATE_ENABLED` feature flag (`src/lib/featureFlags.ts`).
4. **Connected to production:** Yes.
5. **Visible in UI:** Yes.
6. **How to access:** Bottom nav **Create (+)** → **Import from Screenshot** (Sparkles). Reads OCR + photo → structured draft the user reviews/edits. Never auto-publishes.
7. **Fully functional:** Extraction works fully (title, description, category/subcategory, brand, condition, price, current bid, auction end date, lot number, marketplace source, seller, location, listing type, confidence score).
8. **Errors / incomplete:** ⚠️ **Partial exposure of the final step.** When `MARKETPLACE_CREATE_ENABLED` is off, the **Publish** action is replaced with a **Copy Details** button — so end-to-end publishing depends on that flag's state. Unreadable screenshots return `{ fallback: true }` → "couldn't read that screenshot, fill in manually." Image size capped at ~11 MB.
9. **API keys required:** OpenAI integration keys.
10. **Hidden in code, not exposed?** The extraction is exposed; the publish path can be hidden behind the feature flag.

---

## 4. AI Event Import from URL

1. **Feature name:** AI Event Import (paste an estate-sale / auction / live-show link → extract a structured event draft).
2. **File locations:**
   - Server: `server/index.ts` — `EVENT_IMPORT_PROMPT` (`~L1106-1130`), `POST /api/events/import` (`~L1132-1252`); SSRF guards (`isBlockedHost`, `dnsLookup`), `fetchPageHtml()`, plus OG/Twitter/JSON-LD meta extraction as a deterministic fallback.
   - Client: `src/lib/events.ts`, `src/pages/SellerEventForm.tsx`.
3. **Currently active:** Yes.
4. **Connected to production:** Yes.
5. **Visible in UI:** Yes (for seller/"holder" account types).
6. **How to access:** **Profile** → **Seller Dashboard** → **Create Event** → "Quick start" → paste a link → **Import** (Zap icon).
7. **Fully functional:** Yes. Extracts title, description, category, start/end datetimes (ISO 8601), city/region/address, seller name, lot count, cover image. Deterministic platform mapping for Whatnot / Poshmark Live / eBay Live online shows.
8. **Errors / incomplete:** None notable. Degrades to OG-meta-only when the LLM call fails or the page can't be fetched; SSRF-protected; only useful extractions are cached. On total failure returns a "couldn't import, enter manually" message.
9. **API keys required:** OpenAI integration keys.
10. **Hidden in code, not exposed?** No.

---

## 5. AI Business Card Import — vision OCR

1. **Feature name:** AI Business Card Import (photo of a business card / signage → extracted business profile draft).
2. **File locations:**
   - Server: `server/index.ts` — `BUSINESS_CARD_PROMPT` (`~L1312`), `callOpenAIBusinessCard()` (`~L1327`), `POST /api/import/business-card` (`~L1368`).
   - Client: `src/lib/businessImport.ts`, `src/pages/BusinessForm.tsx`.
3. **Currently active:** Yes.
4. **Connected to production:** Yes.
5. **Visible in UI:** Yes.
6. **How to access:** **Map / Treasure Map** → **Add Business** → "Quick start" → **Scan business card**.
7. **Fully functional:** Yes. Returns a draft the user reviews/edits; a business is never auto-created. Privileged `verified`/`featured` fields are not settable through this path.
8. **Errors / incomplete:** None notable. Unreadable card returns null/fallback → "enter the details manually."
9. **API keys required:** OpenAI integration keys.
10. **Hidden in code, not exposed?** No.

---

## 6. AI Business Import from URL (website / Facebook)

1. **Feature name:** AI Business Import (website or Facebook page URL → extracted business profile draft).
2. **File locations:**
   - Server: `server/index.ts` — `BUSINESS_IMPORT_PROMPT` (`~L1403`), `POST /api/business/import` (`~L1428` onward); SSRF-protected URL fetch + OG/JSON-LD meta + LLM normalization (mirrors the event importer).
   - Client: `src/lib/businessImport.ts`, `src/pages/BusinessForm.tsx`.
3. **Currently active:** Yes.
4. **Connected to production:** Yes.
5. **Visible in UI:** Yes.
6. **How to access:** **Map / Treasure Map** → **Add Business** → "Quick start" → **From website** / **From Facebook**.
7. **Fully functional:** Yes for general websites. Facebook frequently blocks scraping, so that path degrades to meta-only or returns nothing — by design. Draft-only; never auto-creates.
8. **Errors / incomplete:** None notable beyond the Facebook scraping limitation noted above.
9. **API keys required:** OpenAI integration keys.
10. **Hidden in code, not exposed?** No.

---

## Areas that are NOT AI (clarifications for the audit scope)

The request asked specifically about semantic search, embeddings, intelligent
ranking, recommendation engines, and duplicate detection. Findings:

- **Global search (`src/lib/search/*`) is NOT AI.** It is a hand-built local-first
  keyword engine: field-weighted scoring (title/tags/category/description/extra),
  a manual `CATEGORY_SYNONYMS` map, a custom light stemmer, **Levenshtein** fuzzy
  matching, a multi-token "complete match" bonus, and **Haversine** distance
  sectioning. There are **no embeddings, no semantic search, and no AI ranking.**
- **Recommendation engine / embeddings:** none exist anywhere in the codebase.
- **Automated pricing:** exists only as the `suggested_price` / value range produced
  inside **AI Treasure Scan (#1)**. There is no standalone pricing engine.
- **Duplicate detection:** the only dedupe is a deterministic **SHA-256 image hash**
  cache inside `/api/ai-scan` (so an identical photo re-scan is free). This is not
  AI/computer-vision duplicate detection.

## AI features that exist in code but are not exposed to users

- **None are dead/unexposed.** All six AI endpoints have working UI entry points.
- **One nuance:** Smart Screenshot Import (#3) exposes the AI *extraction* to users,
  but its final **Publish** step is hidden behind the `MARKETPLACE_CREATE_ENABLED`
  feature flag — when the flag is off, users can extract and copy details but not
  publish a listing directly.

## Privacy / disclosure note

The privacy policy (`src/pages/PrivacyPolicy.tsx`) already discloses that images are
sent to the AI provider for item identification and resale estimates, and that
results are logged — consistent with the AI Treasure Scan implementation.
