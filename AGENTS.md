<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

# Matilda

A TanStack Start app on Convex. Use pnpm for everything. Before you say a change works, run `pnpm check`. It typechecks, runs ESLint and builds. There's no CI, so nothing else runs it.

## Rules

When the operator corrects you, fix the mistake and add its rule here. If the rule was already here and nothing enforces it, the mistake is a repeat. Enforce it in the same change, with a type, a lint rule or a script in `scripts/`. Drop a rule once its mistake can't happen.

| Rule                                                                                                                                                                                                          | Enforced by                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Run package commands with pnpm (`pnpm add`, `pnpm exec`, `pnpm dlx`), never npm, npx or yarn.                                                                                                                 | Nothing fails yet. The scripts in `package.json` use pnpm.                                                 |
| `pnpm check` passes before you report a change as done.                                                                                                                                                       | Judgment. Run it before every push.                                                                        |
| Don't add CI/CD: no GitHub Actions or other pipelines. Checks run locally.                                                                                                                                    | Judgment                                                                                                   |
| Define Convex functions in `convex/models/<table>/functions.ts`, collect them in a `<table>Api` object, and re-export them from `convex/api/<table>.ts`. A self-contained feature can be a component under `convex/components/<name>/` instead. Only Convex config files go directly in `convex/`. | ESLint, `eslint.config.mjs`                                                                                |
| Reusable backend code goes in `convex/lib/`. Add a folder under `convex/models/` only when a table needs one.                                                                                                 | Judgment                                                                                                   |
| The dev server runs on port 3000, because `SITE_URL`, email links and the OAuth allowlist depend on it. Never move it to another port with `--port`.                                                          | `strictPort` in `vite.config.ts`                                                                           |
| A PR changes at most 2000 lines (not counting the lockfile, generated code and `src/components/ui`).                                                                                                          | `scripts/pr-size.sh origin/<base>`, run before opening or updating a PR. The operator approves exceptions. |
| A PR covers one agreed scope. Confirm the scope before adding to an open PR, and stack follow-ups as separate PRs.                                                                                            | Judgment                                                                                                   |
| Write functions as arrow functions (`const f = () => {}`) in `convex/`, `src/lib/` and `src/hooks/`. React components stay declarations.                                                             | ESLint `func-style`, `eslint.config.mjs`                                                                   |
| Validate input with convex-helpers and zod (`zCustomMutation`, `zCustomAction`) where it applies.                                                                                                             | Judgment                                                                                                   |
| Only internal Convex functions get `returns` validators. Public functions don't need them.                                                                                                                    | Judgment                                                                                                   |
| In React, use hooks instead of `useEffect`, and keep `useState` to a minimum.                                                                                                                                 | Judgment                                                                                                   |
| Keep the code plain. Don't add an abstraction that has one use, write JSDoc only where it helps, and never comment every line.                                                                                | Judgment                                                                                                   |
| Do date and time math and formatting with luxon: the helpers in `convex/lib/time.ts` (shared by the backend and the browser) or `DateTime`. Never `new Date()`, `Date.parse`, `toISOString` or `Intl.DateTimeFormat`. | ESLint `no-restricted-syntax`, `eslint.config.mjs` (tests excepted). A date's `toLocaleString` is judgment. |
| Ask the operator for approvals in a few short tl;dr lines.                                                                                                                                                    | Judgment                                                                                                   |
| `convex env list` prints secret values, so print only names: `pnpm exec convex env list \| cut -d= -f1`. An exported `CONVEX_DEPLOYMENT` overrides `.env.local`, so check which deployment a command targets. | Judgment                                                                                                   |
