---
name: Blog / SEO content engine
description: How the TreasureTrail blog (SEO growth plan) is architected — authoring model, soft-fail reads, and the dynamic sitemap contract.
---

# Blog / SEO content engine

The blog (`/blog`, `/blog/:slug`, `/blog/category/:cat`) is the organic-growth
surface built from the 30-Day SEO Growth Plan. It runs in web + native + as a
crawlable SEO surface.

## Authoring is admin-only via service role
**Rule:** `blog_posts` has a single RLS policy — public SELECT of `status='published'`.
There is intentionally NO end-user insert/update/delete policy. All writes go
through the server (`/api/blog/save`) using the service-role client
(`getServiceClient()` in `server/grants.ts`), gated by `requireAdmin`
(`profiles.role='admin'`). `/api/blog/generate` drafts an article
with OpenAI and returns JSON only (never persists; key stays server-side).
**Why:** content is curated, not user-generated, so the simplest secure model is
"no self-serve write path" rather than per-row authoring RLS.

## Reads must soft-fail pre-migration
**Rule:** every fetcher in `src/lib/blog.ts` returns `[]`/`null` on PostgREST
`PGRST205` (table missing) or `42703` (column missing). The agent cannot apply
Supabase DDL — the user runs the migration manually — so the app must render an
empty "Articles coming soon" state, never crash, before the table exists.

## Dynamic sitemap contract
**Rule:** `/sitemap.xml` is a SERVER route (`server/index.ts`, production block),
NOT a static file. The old `public/sitemap.xml` was deleted because
`express.static` would shadow the dynamic route. The dynamic route MUST list
every stable canonical public route (`/`, `/home`, `/events`, `/map`,
`/marketplace`, `/auctions`, `/community`, `/pro`, `/safety`, `/privacy`,
`/terms`, `/guidelines`, `/live`, `/blog`) PLUS blog categories + published
posts.
**Why:** the first version only listed blog/map/live and silently dropped
previously-indexed routes — a real crawl-coverage regression. Never re-add a
static `public/sitemap.xml`, and never trim the static-route list without
checking what was previously indexed.
**How to apply:** when adding a new public page worth indexing, add it to the
`STATIC_ROUTES` array in the `/sitemap.xml` handler.

## Route ordering
`/blog/category/:cat` is declared before `/blog/:slug` in AppShell; the server
`/blog/:slug` OG handler skips `slug==='category'` and only matches a single
kebab segment so it never intercepts category URLs.
