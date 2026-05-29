---
name: build runs strict tsc (noUnusedLocals)
description: why leftover/unused imports silently break `npm run build` but not the dev server
---

`npm run build` runs `tsc && vite build`, and tsconfig has `noUnusedLocals: true` + `noUnusedParameters: true`. So any unused import or unused function param is a HARD build failure (TS6133), even though the dev workflow (`vite` only, no tsc) runs fine and hides them.

**Why:** the dev server uses esbuild which ignores unused symbols; only the build's `tsc` gate catches them. After deleting a feature's UI you must also delete every now-unused import and prop/param it left behind, or the build breaks while dev looks healthy.

**How to apply:** after any removal/refactor, run `npx tsc --noEmit` (not just a dev reload) before claiming done. Treat TS6133 across unrelated files as latent debt that the build will surface.
