---
name: Autoscale vs publicDir conflict in .replit
description: Why a Static→Autoscale switch silently stays Static / disables Publish, and how to actually fix it
---

# Autoscale deployment keeps reverting to Static / Publish button disabled

When a repl was first published as a **Static** deployment and is later switched to
**Autoscale**, the `.replit` `[deployment]` block can keep the Static-only key
`publicDir = "dist"` alongside `deploymentTarget = "autoscale"`. That combination is
invalid for Autoscale and causes: (a) the Publish button to be disabled, and
(b) publishes to silently come out as Static (Replit sees `publicDir` and treats it as static).

**Why:** `publicDir` is only valid for `deploymentTarget = "static"`. An Autoscale
config must contain only `deploymentTarget` + `build` + `run` (no `publicDir`).

**How to apply / the real gotcha:**
- The `deployConfig({deploymentTarget:"autoscale", build, run})` tool reports
  `success` and `publicDir: null`, but does **NOT** remove the existing `publicDir`
  line from `.replit` on disk — it persists across repeated calls.
- The agent is **blocked** from editing `.replit` directly ("Direct edits to .replit
  ... are not allowed").
- Resolution that actually works: the **user** opens `.replit` in the file editor and
  manually deletes the `publicDir = "dist"` line, then publishes. After that the live
  deployment reports `deploymentType: "autoscale"` and `/api/*` is served by the app.

**Side effect:** switching deployment type detaches the custom domain — it returns
Replit's "This app isn't live yet" placeholder until re-attached in Publishing settings.
The generated `*.replit.app` URL becomes the working primary in the meantime.
