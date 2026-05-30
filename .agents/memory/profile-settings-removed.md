---
name: Profile Settings removed
description: Why the Profile Settings sheet is gone and where account deletion now lives
---

The bottom-sheet "Profile Settings" modal (username/bio edit + legal links + Delete Account) was removed entirely from src/pages/Profile.tsx.

**Why:** the sheet repeatedly failed to scroll to its bottom control (Delete Account) on iOS across many fix attempts; the user gave up on it and asked to delete the whole panel and relocate delete. Apple requires account deletion to be reachable, so it cannot just disappear.

**How to apply:** Delete Account, Privacy Policy, and Terms of Service now render in an "Account" section at the bottom of the normal scrollable Profile page content (inside PageScroll), which scrolls reliably. DeleteAccountConfirm dialog is still used. Username/bio in-app editing was intentionally dropped. Do NOT reintroduce a bottom-sheet settings modal for these controls — keep account/legal/delete actions in page-native scrollable content.
