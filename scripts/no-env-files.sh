#!/usr/bin/env bash
# Fails when git tracks any .env file, even one forced past .gitignore.
# Values go in the environment, on Convex, or in Wrangler; never in the repo.
set -euo pipefail
tracked=$(git ls-files -- '.env*' '**/.env*')
if [ -n "$tracked" ]; then
  echo "Tracked env files (remove with git rm --cached):" >&2
  echo "$tracked" >&2
  exit 1
fi
