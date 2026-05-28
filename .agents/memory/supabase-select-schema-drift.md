---
name: Supabase select column drift hidden by soft fallbacks
description: When a `.select()` references a column the table doesn't have, Supabase returns an error for the whole query (no partial rows). If the caller catches it as a non-fatal warning and renders a "thing unavailable" empty state, the bug is invisible in the UI and only the browser console says why.
---

# The trap

Pattern that recurs in this codebase:

```ts
const { data, error } = await supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', ids);
if (error) console.warn('[wanted] requester fetch failed:', error.message);
const map = new Map((data ?? []).map(...));
return rows.map((r) => ({ ...r, requester: map.get(r.user_id) ?? null }));
```

If `display_name` doesn't exist on `profiles`, PostgREST 400s the entire query.
`data` is `null`, every row maps to `requester: null`, and the UI shows
"Requester unavailable" for every card. The only signal is one console.warn.

**Why:** the soft fallback was added so a deleted/stale individual requester
doesn't blow up the card. But it also swallows schema-shape errors that affect
*every* row at once.

# How to apply

1. When a "thing unavailable" empty state appears for **every** row of a feed
   (not just some), open the browser console first — look for
   `column X does not exist`, `relation Y does not exist`, or 400 from
   `/rest/v1/...?select=`.
2. The fix is almost always to remove the non-existent column from the
   `.select()` (and document the omission with a comment so the next
   contributor doesn't re-add it).
3. **Profiles in particular** currently exposes only `id, username,
   avatar_url, bio, favorite_categories` + gamification fields. There is **no**
   `display_name`, no `full_name`, no `email`. If you need a display label,
   fall back to `username`.
4. When writing best-effort joins like `attachRequesters`, distinguish two
   cases in the warning so future-you can tell them apart at a glance:
   - per-row miss (id not in returned set) → render empty state, expected.
   - query-level error → loud warning, investigate before shipping.

# Related

- ARCHITECTURE.md §6 (external-link / fallback rules) — same principle:
  branded fallback is fine, but never let it mask an upstream failure that
  applies to every item.
