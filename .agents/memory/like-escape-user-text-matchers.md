---
name: LIKE-escape user text in substring matchers
description: Any SQL ILIKE/LIKE substring match built from user-supplied text must escape % _ \ or it becomes a match-everything spam/injection vector.
---

When a SECURITY DEFINER matcher fans out notifications by testing
`target ILIKE '%' || user_text || '%'`, the user_text is attacker-controlled.
A value like `%%%` (or one containing `_`) turns the predicate into
match-everything, so a single crafted Wanted Request (or saved search) would
notify on every listing — mass notification spam.

**Rule:** escape `\`, `%`, `_` in the user text and pair the predicate with
`ESCAPE '\'`. A reusable `public.like_escape(text)` immutable helper does this.

**Why:** caught in architect review of the wanted-match matcher; the conservative
"title substring of listing" predicate was injectable. Same risk applies to any
future client-driven LIKE/ILIKE filter built from stored user strings.

**How to apply:** never interpolate raw user text into a LIKE/ILIKE pattern.
Wrap it in `like_escape(...)` and add `escape '\'`. Also: leading-`%` patterns
can't use a btree index, so keep the candidate set bounded (e.g. only OPEN rows)
and revisit pg_trgm if volume grows.

Related: matcher fanout also needs (1) an atomic ON CONFLICT DO NOTHING RETURNING
claim ledger for exactly-once, (2) a BEGIN/EXCEPTION guard so notification
failure never rolls back the triggering insert, and (3) a pref gate that uses
`jsonb_typeof(...) = 'boolean'` before casting so a malformed prefs value can't
raise and (via the exception guard) silently drop the entire fanout.
