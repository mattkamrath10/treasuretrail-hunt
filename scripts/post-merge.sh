#!/bin/bash
set -e

# Install any newly added/updated dependencies from merged tasks.
npm install --no-audit --no-fund
