---
name: iOS safe-area requires viewport-fit=cover
description: env(safe-area-inset-*) silently returns 0 without viewport-fit=cover in the viewport meta
---

`env(safe-area-inset-top/bottom/...)` evaluates to **0** on iOS (Safari + Capacitor
WKWebView) UNLESS the viewport meta tag includes `viewport-fit=cover`.

**Symptom that points here:** headers/footers that DO use env(safe-area-inset-*)
padding still sit under the status bar / Dynamic Island in portrait, but look fine
in landscape (landscape has no top inset). The padding isn't missing — it's
resolving to 0 because the viewport opt-in is absent.

**The rule:** the viewport meta in index.html must carry `viewport-fit=cover`. With
it, every existing env() inset across the app becomes live at once. Enabling it is
safe only because the bottom nav (BottomNav) and sheets already pad with
env(safe-area-inset-bottom) — verify any fixed bottom element does too before adding
it, or content slides under the home indicator.

**How to apply:** a topmost page header (the first element on screen, sticky/fixed
top:0 OR the first flex child of a full-height column) must add
`paddingTop: calc(env(safe-area-inset-top, 0px) + <base>)`. Per-page inline style
objects mean this is NOT centralized — each new top-level screen must add it
itself, so this regresses one page at a time as new screens are added.

A full sweep of every page in `src/pages` was completed (June 2026): all top
headers/containers now carry the inset. When fixing a shorthand `padding` block,
either declare `paddingTop` AFTER the shorthand (React keeps both; later longhand
wins the top value) or replace shorthand with explicit longhands. Auth/setup pages
(Login/SignUp/Onboarding/ProfileSetup) put the inset on the root CONTAINER, not a
header, since they have no header bar. To prevent future per-page regressions,
consider a shared top-safe-padding token/helper.
