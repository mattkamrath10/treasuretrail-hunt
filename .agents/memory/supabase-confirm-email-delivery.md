---
name: Supabase confirm-email delivery (Apple 2.1a)
description: Why signup confirmation emails "never arrive" and why it's a Supabase dashboard config issue, not an app code bug.
---

# Confirmation emails not delivered → Apple 2.1(a) rejection

**Symptom:** Apple rejects with Guideline 2.1(a) App Completeness — "we did not
receive any email for confirmation during account creation." App shows a "Check
your email" screen but the email never arrives.

**Root cause (confirmed read-only via auth.admin.listUsers):**
- The Supabase project has **Confirm email ON** (signUp returns no session →
  app's `needsConfirmation` branch fires → "check your email" screen).
- `supabase.auth.signUp({email,password})` is called with **no custom SMTP and no
  emailRedirectTo** — delivery is 100% delegated to the project's email settings.
- Unconfirmed users have `confirmation_sent_at` **populated** (Supabase recorded a
  send) yet remain unconfirmed with `last_sign_in: null`. That signature ("sent"
  timestamp set but inbox empty) is the hallmark of Supabase's **built-in/default
  email sender**, which is rate-limited (~handful/hour), flagged "not for
  production," and drops/spam-files most messages.

**Why it's NOT a code bug:** the app correctly asks Supabase to send; the failure
is in the Supabase Auth email delivery configuration (dashboard), which the agent
cannot change from the repl (needs dashboard / Management API access).

**Fix options (both dashboard-side, Authentication settings):**
1. Fastest/free — **disable "Confirm email"** in Supabase Auth. Then signUp
   returns a session immediately; app already handles this (`needsConfirmation=false`
   → proceeds to ProfileSetup). Removes the exact thing Apple is blocked on.
2. Proper — **configure a custom SMTP provider** (Resend/SendGrid/Postmark; some
   free tiers) so confirmation emails actually deliver. Keeps email verification.

**Secondary latent issue:** `signUp` sets no `emailRedirectTo`, so even when mail
delivers, the confirm link uses the project's Site URL — verify it points at the
live site, not localhost.

**How to apply:** when a "no confirmation email" / 2.1a rejection appears, don't
patch signup code — check Supabase Auth email config first.
