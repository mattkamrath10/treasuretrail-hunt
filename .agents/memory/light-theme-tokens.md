---
name: Light theme semantic tokens
description: The --tt-* theme token system, what's intentionally dark, and the per-category accent legend not to "fix"
---

# Light theme semantic tokens

`src/styles/index.css` defines a `--tt-*` semantic token set as the single source of truth for theme colors:
`--tt-bg / -surface / -surface-2 / -surface-3 / -border / -border-strong / -text / -text-muted / -text-dim / -header-bg / -image-bg / -overlay` plus an ORANGE accent ramp `--tt-accent / -strong / -contrast / -soft / -border / -gradient`.

- Defaults at `:root` are LIGHT (map onto the existing `--color-neutral-*` ramp; `--color-neutral-0` = #fff).
- `[data-theme="dark"]` scope overrides the same tokens back to the original midnight palette. Opt a subtree in by setting that attribute; accent stays orange in both.
- The app was ALREADY mostly light (most pages use `var(--color-neutral-*)`). The only genuinely-dark non-excluded screens were the Wanted trio (Wanted.tsx / WantedForm.tsx / WantedDetail.tsx), which used hardcoded dark + a GREEN (#10b981/#047857) accent — now tokenized to light + orange.

**Why:** future theme tweaks should be one-place token edits; new/converted surfaces should reference `--tt-*`, not new literals.

**How to apply:** when converting or building a screen light, use `--tt-*`. When a shared component must look correct inside a dark surface, style it with tokens and wrap the dark surface in `data-theme="dark"`.

## Intentionally left as-is (do NOT "correct")
- **Sell.tsx and Pro.tsx** stay hardcoded dark (Create menu + Membership/Pro) — required to look identical; not opted into the dark scope, just untouched.
- **Discover.tsx** is owned by the Discover redesign task and stays dark/owned there.
- **UserShowcase.tsx Rail accents are a per-category color legend**: Finds = purple #8b5cf6, Events = amber #f59e0b, Wanted = green #10b981 (dot + the green WANTED badge on the image). This is category color-coding, NOT a missed dark→orange conversion. Recoloring the Wanted green to orange would collide with the amber Events accent. Leave it.
- White-on-color buttons and image letterbox backgrounds (#0a0a0a/#000 behind photos, `rgba(255,255,255,…)` controls over images) in HostEventCTA/EventsMap/Events/BusinessDetail/EventDetail are correct on light pages — not dark panels.
