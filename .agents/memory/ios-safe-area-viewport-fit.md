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
itself. PublicProfile/Following/Safety had to be fixed individually; others
(SellerDashboard, Events, SellerAnalytics, ReviewMode, CommunityGuidelines,
WantedDetail) still lack it.
