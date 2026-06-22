---
name: AI screenshot/photo import pattern
description: How "Upload from a screenshot" vision-OCR import features are wired (business card, event flyer) so a new one mirrors them exactly.
---

# AI screenshot import pattern (vision OCR -> draft form fields)

Two import surfaces share ONE pattern; copy it for any new "scan a photo to pre-fill a create form":
- Business listing: `/api/import/business-card` + `analyzeBusinessCard` (src/lib/businessImport.ts) + BusinessForm.tsx
- Event: `/api/import/event-screenshot` + `analyzeEventScreenshot` (src/lib/events.ts) + SellerEventForm.tsx (create flow only)
- Marketplace listing (older sibling): `/api/import/screenshot` + screenshotImport.ts
- Wanted ad: `/api/import/wanted-screenshot` + `analyzeWantedScreenshot` (src/lib/wanted.ts) + WantedForm.tsx; reuses the file's existing `WANTED_CATEGORIES`/`normalizeWantedCategory` (do NOT redeclare — collision), extracts title/description/category/budget (budget = digits-only suggested max).

**Server contract (server/index.ts):** auth bearer -> `sb.auth.getUser()`; validate `imageDataUrl` regex `^data:image/(png|jpe?g|webp|gif|heic|heif);base64,` and `length <= 11_000_000` (else 413); `claimAiSlot` (shared per-user quota via `claim_ai_scan_slot` RPC + `ai_scans_log`, free=FREE_DAILY_LIMIT / pro=PRO_DAILY_SOFT_CAP keyed on `profiles.membership_tier`); call OpenAI `MODEL` vision (`response_format json_object`, `max_completion_tokens 600`, image detail high, withTimeout 25s); sanitize; on failed/empty extraction `releaseAiSlot` (don't charge) and return `{ fallback: true }`; over-quota returns `{ fallback:true, limited:true }`; success `{ data, source:'ai' }`. NEVER auto-creates the row — only returns a draft the user reviews.

**Client contract:** returns `null` on ANY failure (null token, !res.ok, fallback, empty) — NEVER throws; uses `apiUrl()` (works in Capacitor webview) + bearer; AbortController timeout 30s; validates category against the exported `*_CATEGORIES` list.

**Date inference (events):** prompt injects today's date so a flyer with no year resolves to the next occurrence; model returns local `YYYY-MM-DDTHH:MM` which the form's `toLocalInput` (new Date()) treats as LOCAL time — exactly what flyers mean.

**Gotchas:**
- 11MB cap = ~8MB raw photo. Large phone PHOTOS of flyers can 413 -> client null -> generic "couldn't read". No client-side downscale today (parity with business-card). If users hit this, add downscale before upload.
- "We couldn't read that screenshot" is shown for unreadable AND not-signed-in AND over-quota AND network — same ambiguity that caused a long false "it's broken" hunt on business-card. Differentiate messages if it recurs.
- iOS Safari historically ignores the `capture` attribute; use a plain `<input type=file accept="image/*">` (no `capture`) so users can pick a screenshot from the library.
