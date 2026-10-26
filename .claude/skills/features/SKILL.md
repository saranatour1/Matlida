---
name: features
description: Matilda's feature map at docs/skills/features/features.md. It says where each feature lives (voice, calls, reminders, email, Telegram, shopping and the rest), which files and functions handle each behavior, the last merged PR that changed it, and where the next features go. Use it before searching the code for a feature ("where does the call hang up?", "what handles Telegram voice notes?", "where would thumbs-up go?"), when asked what changed lately, and after a PR merges, to bring the map up to date. Use it even when the user doesn't mention the map.
---

# Features map

`docs/skills/features/features.md` maps Matilda's features to their code. It exists so an agent can find a feature without reading the whole repo, and so the operator can see what changed and where.

## Finding a feature

1. Read `features.md` and pick the section. "How the code is laid out" at the top says what each folder holds.
2. Open the `file:symbol` references in that section. They're the entry points. Read outward from them.
3. If no section covers the code you found, fix the map while you're there (see below).

## Updating the map

The map records merged work only. A PR goes in once all of these hold, and the update is done only when they all still hold afterwards:

- **The PR is merged on master.** `gh pr view <N> --json state,mergedAt` says `MERGED`. Open or draft PRs don't go in, because their code can still change.
- **Checks pass on master.** Matilda has no CI. `pnpm check` (typecheck, ESLint and a production build) does that job, so run it on a checkout of `origin/master` after the merge.
- **No TypeScript errors.** `pnpm check` runs the typecheck first, so a pass covers this. If it fails, master is broken. Say so and stop: fixing master comes before mapping it, and the map shouldn't call broken work done.

Then:

1. **Find what merged since the map.** Run `git fetch origin`, then `git log --first-parent --oneline origin/master`. Read down to the PR named in `Mapped through:`; everything above it is new. Each subject ends in `(#N)`.
2. **See what each PR touched.** Run `gh pr view <N> --json files --jq '.files[].path'`. Skip tests, generated code and `src/components/ui/`. Read the diff (`gh pr diff <N>`) wherever the bullets might need to change.
3. **Update the sections it touched.**
   - Add a bullet for each new behavior, and fix bullets the PR changed. Name the function or constant that does it as `file:symbol`, so the next agent can jump straight there.
   - Put a new file under the section it belongs to, by adding it, or its folder, to that section's `Paths:`. If no section fits, it's a new feature: add a section (see the format below).
   - Delete bullets for behavior the PR removed. Point paths and references at code that moved, and check that each symbol still exists: `grep -w <symbol> <file>`.
4. **Refresh `Last PR:`** in each touched section. The newest merged PR for a section is `git log -1 --first-parent --format=%s origin/master -- <its paths>`. Its dates come from `gh pr view <N> --json mergedAt,commits --jq '"changed \(.commits[-1].committedDate[0:10]) · merged \(.mergedAt[0:10])"'`.
5. Set `Mapped through:` at the top to the newest PR on master.
6. If README's "What's next" changed, update "Where the next features go" to match.
7. Run `pnpm check`. Then commit the map on its own branch and open a small PR, "Update the features map through #N". A map update is its own scope, so don't fold it into an unrelated PR.

## Section format

```markdown
## Voice and calls

One or two sentences on what a user gets.

Paths: `convex/models/calls/` `src/components/voice-call.tsx`
Last PR: [#171](https://github.com/saranatour1/Matlida/pull/171) Title · changed 2026-10-23 · merged 2026-10-23

- **A behavior**: what it does, in `convex/models/calls/dial.ts:placeCall`.
- **When a phone call hangs up**: one line per reason, each with its symbol.
```

- `Paths:` holds backticked files and folders. A folder ends in `/` and claims everything under it. A file can sit in two sections when it really serves both.
- In `Last PR:`, "changed" is the PR's last commit and "merged" is when it landed. Both come from GitHub.
- Bullets are sub-features: one line per behavior a person would ask about ("when does a call hang up?", "what stops a recurring reminder?"), with the symbol that does it. Point at the code; don't restate it. A bullet that only paraphrases a function's body is noise.
- Feature files are everything under `convex/models`, `convex/components`, `convex/lib` and `src`, except generated code, `src/components/ui` and tests. `convex/api/` only re-exports, so it isn't mapped.

## What counts as a feature

A section is something a user can do or notice: calls, reminders, email. Plumbing several features share goes in "Shared code". A new table under `convex/models/` usually means a new section. Keep sections in the order a user meets them: signing in, the workspace, the chat, then the rest.
