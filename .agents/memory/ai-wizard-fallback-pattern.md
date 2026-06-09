---
name: AI Wanted Wizard — server-proxied AI behind deterministic interfaces
description: How AI category inference + question generation slot behind the Phase 2 wizard interfaces with bulletproof fallback.
---

# AI Wanted Wizard (category inference + question generation)

The wizard's category guess and per-category question set are powered by AI but
sit BEHIND the Phase 2 interfaces so callers never change and a slow/failing AI
can never block request creation.

- **Inference**: `activeInferrer` (in `wantedInference.ts`) is the single swap
  point — it's now the AI inferrer. It always computes the rule-based guess
  first and returns it on ANY error / timeout / missing-auth / invalid output,
  and even prefers it when the AI's confidence is lower. The `CategoryInferrer`
  interface is async-capable, and the wizard already resolves it through
  `Promise.resolve(...)`, so the swap needed zero wizard changes.
- **Questions**: `generateQuestions(term, category)` returns the static
  `questionsFor(category)` set on any failure. The wizard seeds `questions`
  state with the static set (instant) and only upgrades to the AI set **while
  still on step 0** (guarded by a `stepRef`), so an async swap can never reset
  answers mid-flow.

**Why:** the wizard turns a dead-end search into a Wanted Request; it must feel
instant and must never trap or block the user behind an AI call.

**How to apply:**
- The OpenAI key stays server-side. Client calls `/api/wanted/infer-category`
  and `/api/wanted/questions` via `apiUrl()` with a Supabase bearer token
  (`supabase.auth.getSession()`), each behind an `AbortController` timeout.
- Endpoints (in `server/index.ts`) return `{ fallback: true }` with **HTTP 200**
  on any failure (not a 4xx/5xx) so the client quietly takes its local path; a
  real 401 only means unauthenticated.
- AI output is validated/normalized on BOTH sides to the category enum
  (`WANTED_CATEGORIES` in `wanted.ts`) and the `WizardQuestion` schema; every
  AI question is forced `optional` so it can never block submit. Server time-
  boxes the OpenAI call (`withTimeout`) and caches by term/category in-memory.
- Model + client live in `server/index.ts` (`MODEL`, `openai`,
  `response_format: json_object`). No DB migration; cache is in-memory only.
