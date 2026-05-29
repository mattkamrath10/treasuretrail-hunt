---
name: Login is a conditional screen, not a route
description: why navigate('/login') silently dumps guest users on Discover instead of the auth screen
---

There is NO `/login` (or `/signup`) route. `App.tsx` shows Login/SignUp by **conditional render** gated on `!user && !isGuest`. AppShell (with the react-router `<Routes>`) only mounts when `user` OR `isGuest` is truthy, and its catch-all `/*` falls back to Discover (`/`).

**Consequence:** a guest (logged out but `isGuest=true`) who triggers `navigate('/login')` stays inside AppShell, hits no matching route, and lands on Discover — NOT the auth screen.

**Correct pattern to send a logged-out/guest user to auth (mirror `WantedDetail.handleMessageRequester`):**
1. `setPendingIntent({...})` (sessionStorage) so the action can resume post-auth.
2. `if (isGuest) exitGuestMode();` — flips the gate so App re-renders Login.
3. `navigate('/')` so App.tsx re-evaluates (must leave public-share paths too).
4. Resume lives in `AppShell.useResumePendingIntent()` — fires once `user` is truthy, reads the intent, navigates to the destination (optionally with router `state` the target page consumes on mount).

Setting a pending intent also makes `App.tsx`'s `hasPendingIntent` true, which intentionally skips the Onboarding splash for first-timers.
