#!/bin/sh
set -eu
LIMIT=2000
base=${1:-origin/$(gh pr view --json baseRefName -q .baseRefName 2>/dev/null || echo master)}
head=${2:-HEAD}
changed=$(git diff --numstat "$base...$head" -- . ':!pnpm-lock.yaml' ':!convex/_generated' ':!src/routeTree.gen.ts' ':!src/components/ui' |
  awk '{ n += $1 + $2 } END { print n + 0 }')
echo "$changed lines changed against $base (limit $LIMIT)"
if [ "$changed" -gt "$LIMIT" ]; then
  echo "Too big to review. Split it into stacked PRs, or ask a human to add the large-pr label with the reason in the PR description." >&2
  exit 1
fi
