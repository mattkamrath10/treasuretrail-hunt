#!/bin/bash
set -e

# Install any newly added/updated dependencies from merged tasks.
npm install --no-audit --no-fund

# Replit's package firewall rewrites package-lock.json tarball URLs to an
# internal host (package-firewall.replit.local) that external CI (Codemagic)
# cannot reach. Rewrite them back to the public npm registry so the committed
# lockfile stays buildable everywhere.
sed -i 's#http://package-firewall.replit.local/npm/#https://registry.npmjs.org/#g' package-lock.json
