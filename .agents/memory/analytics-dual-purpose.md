---
name: analytics.ts is two trackers in one file
description: src/lib/analytics.ts holds BOTH first-party Supabase tracking and GA4 web analytics; don't overwrite one when adding the other.
---

`src/lib/analytics.ts` exports two unrelated tracking systems:

- `trackAnalyticsEvent` (+ `AnalyticsKind`/`AnalyticsTargetKind`/`TrackArgs`) — first-party engagement, inserts to the `analytics_events` Supabase table. Consumed by EventDetail/WantedDetail and powers Pro reach analytics.
- `initAnalytics`/`trackPageview`/`analyticsEnabled` — Google Analytics 4 site-traffic tracking. Inert until `VITE_GA_MEASUREMENT_ID` (G-XXXX) is set at build time; web-only (skips Capacitor native). Wired via `usePageviewTracking` in AppShell (manual SPA page_view on route change, send_page_view:false).

**Why:** these were added in different sessions; a full-file rewrite to add GA4 once deleted `trackAnalyticsEvent`, breaking the build (its consumers import it).
**How to apply:** when touching analytics, edit additively — never overwrite the whole file. Both export groups must survive.
