---
name: Generate large/zip files in /tmp, not public/
description: Why writing archives or big files directly into a watched dir (public/) stalls, and the /tmp-then-copy fix
---

# Generate large/zip files in /tmp, then copy into public/

When building a zip/tarball/large file to be served, write it to `/tmp/<name>`
first, then `cp` the finished file into `public/`. Never `-o` directly into
`public/` (or any vite-watched dir).

**Why:** Writing a growing file into `public/` triggers vite's file watcher +
Replit's FS sync on every write chunk. This throttles the write so hard the file
sits at 0 bytes and the process appears hung / gets killed — looks exactly like an
OOM (exit 137) or a stall, but it is watcher/sync contention, NOT memory. A
`git archive` that hangs at 0 bytes in public/ completes in ~1s when targeted at
`/tmp` (tmpfs, unwatched). Confirmed by `free -m` showing 12GB free while commands
were getting SIGKILLed.

**How to apply:**
- `git archive --format=zip -o /tmp/out.zip HEAD <paths…>` then `cp /tmp/out.zip public/…`.
- Pass explicit top-level pathspecs to `git archive` (reads from the git pack =
  fast); avoid `.` + `:(exclude)` magic — the positive `.` forces a slow walk.
- For a code-only backup, include `src server supabase scripts ios android` + config
  files + docs; exclude `attached_assets` (large incompressible PNGs/screenshots) and
  the old nested `*.zip` backups, which bloat the archive to ~91M and crawl.

# Secondary lesson: orphaned chromium from screenshot runs eats RAM
Playwright/headless-chromium screenshot runs leave `.chrome-wrapped` processes
alive (~100-185MB each). They respawn and pile up; `pkill -9 -f chrome` after a
screenshot session frees hundreds of MB if the env feels starved.

# Secondary lesson: git-lfs daemons hang when LFS budget is blown
With the LFS budget exhausted, `git-lfs filter-process` daemons spawned by git
operations hang on the LFS server and never exit, leaking memory. `git lfs
uninstall --local` removes the filter config so future git ops stop spawning them.
