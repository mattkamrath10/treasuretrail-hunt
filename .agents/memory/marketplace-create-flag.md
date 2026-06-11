---
name: Marketplace create beta flag
description: Where the marketplace listing-creation beta gate lives and what it controls
---
The boolean that gates publishing user-created marketplace listings is `MARKETPLACE_CREATE_ENABLED`, exported from `src/lib/featureFlags.ts`.

**Why:** It used to be a private const inside `Marketplace.tsx`. Smart Screenshot Import also needs to gate its Publish step on the exact same flag, so it was promoted to a shared module to stay in lockstep. Two copies would drift and one surface could go live while the other stayed off.

**How to apply:** Any new surface that publishes a marketplace_listing (or shows a create CTA) must import this flag, not define its own. When false: hide create CTAs / disable Publish. Smart Import keeps its extraction+review flow available even when false — only the final publish is gated (it offers "Copy Details" instead).
