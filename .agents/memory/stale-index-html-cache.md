---
name: Stale index.html cache masks deploys
description: "Recurring 'edits not saving'/'fix didn't work' on the published app can be a cached entry point, not a code/DB bug."
---

When a feature works in code + DB but a user (esp. mobile Safari) keeps reporting
it "still broken" across multiple deploy attempts, suspect a stale cached
`index.html`, not the feature.

**Why:** the prod Express server (`server/index.ts`) serves the SPA. If
`index.html` (via `express.static` AND the SPA-fallback `sendFile`) has no
Cache-Control, Safari caches the entry point and keeps loading the OLD hashed JS
bundle — so every deploy's fix never reaches the device. This presented as
"profile edits not saving" even though admin write, the user's real RLS write,
and a bio write+readback all persisted correctly.

**How to apply:** serve `index.html` with `no-cache, no-store, must-revalidate`
on both the static middleware (`setHeaders`) and the SPA fallback; give
content-hashed `/assets/*` `public, max-age=31536000, immutable`. Before editing
client/DB code for a "still broken" report, first PROVE the path works (mint the
user's session via admin generateLink magiclink -> verifyOtp, write+readback) so
you don't burn another attempt fixing already-correct code.
