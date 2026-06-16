---
name: Codemagic build fails on package-firewall.replit.local lockfile URLs
description: Replit package installs poison package-lock.json with internal proxy URLs that break external npm installs
---

# Codemagic npm install fails: ENOTFOUND package-firewall.replit.local

Installing an npm package through Replit's package manager writes the resolved
tarball URL as `http://package-firewall.replit.local/npm/<pkg>...` into
`package-lock.json`. That host only exists inside Replit's network, so any
build that runs `npm install` OUTSIDE Replit (Codemagic on a Mac, GitHub
Actions, etc.) dies with:
`npm error code ENOTFOUND ... package-firewall.replit.local`.

**Fix:** rewrite every internal URL to the public registry, then push to GitHub:
`sed -i 's|http://package-firewall.replit.local/npm/|https://registry.npmjs.org/|g' package-lock.json`
Integrity (sha512) hashes stay valid — Replit's proxy serves identical tarballs.

**Why it recurs:** any later `npm install`/package op done through Replit can
re-poison the lockfile. After adding/updating deps, re-check
`grep -c package-firewall.replit.local package-lock.json` (must be 0) BEFORE
pushing the branch Codemagic builds from. Do NOT run `npm install` to "verify"
the fix — Replit's registry config rewrites the URLs straight back.

**The post-merge setup script is a poisoning source too.** `scripts/post-merge.sh`
runs `npm install` after every task merge, which re-poisons the lockfile. That
script now appends the same `sed` rewrite right after the install so merges leave
a buildable lockfile. Any post-merge script that runs `npm install` MUST keep that
sed line, or Codemagic will start failing again after the next merge. The npm
error can surface as `Exit handler never called!` on the Mac builder, not always
a clean ENOTFOUND.
