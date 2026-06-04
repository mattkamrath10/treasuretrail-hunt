---
name: Guest gating must key on !user, not !profile
description: Why auth-only pages must show an account gate for guests instead of a profile-loading spinner
---

Auth-only pages (Seller Dashboard / Event Form / Analytics, and any future
seller surface) must gate guests with `if (!user) return <AccountRequired/>`
BEFORE any `if (!profile) return <spinner>`.

**Why:** A guest is `isGuest=true, user=null`, and the AuthProvider never
loads a profile for a guest. So `if (!profile) <spinner>` hangs forever — this
was the "blank pink screen with infinite spinner" Create Event bug. The
spinner is only valid for the signed-in-but-profile-still-loading case.

**How to apply:** Order the early returns: `!user` (guest → AccountRequired)
first, then `!profile` (spinner), then role checks (holder/Pro). AccountRequired
stashes `sessionStorage.tt_auth_view` ('login'|'signup') + calls exitGuestMode()
+ navigate('/'); App.tsx reads that key synchronously in its `!user` render
branch (no Login flash) and an effect clears it. There is NO /login route —
gate via exitGuestMode, never navigate('/login').
