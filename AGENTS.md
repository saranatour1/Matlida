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

A TanStack Start app on Convex. Use pnpm for everything. Before you say a change works, run `pnpm check`: it typechecks, runs ESLint and builds, and CI runs the same command.

## Rules

When the operator corrects you, fix the mistake and add its rule here. If the rule was already here and nothing enforces it, that's a repeat: enforce it, as high in the stack as possible, in the same change. Drop a rule once its mistake can't happen.

| Rule | Enforced by |
| --- | --- |
| Run package commands with pnpm (`pnpm add`, `pnpm exec`, `pnpm dlx`), never npm, npx or yarn. | Nothing fails yet. The scripts in `package.json` use pnpm, and CI installs from the pnpm lockfile. |
| `pnpm check` passes before you report a change as done. | CI, `.github/workflows/ci.yml` |
| Define Convex functions in `convex/models/<table>/functions.ts`, collect them in a `<table>Api` object, and re-export them from `convex/api/<table>.ts`. Only Convex config files go directly in `convex/`. | ESLint, `eslint.config.mjs` |
| Reusable backend code goes in `convex/lib/`, and table folders under `convex/models/` are added only when needed. | Judgment |
| The dev server runs on port 3000, because `SITE_URL`, email links and the OAuth allowlist depend on it. Never pass `--port` for the app itself. | `strictPort` in `vite.config.ts` |
| A PR changes at most 2000 lines (not counting the lockfile, generated code and `src/components/ui`). | `.github/workflows/pr-size.yml`. A human adds the `large-pr` label for an exception. |
| A PR covers one agreed scope. Confirm the scope before adding to an open PR, and stack follow-ups as separate PRs. | Judgment |
| Validate input with convex-helpers and zod (`zCustomMutation`, `zCustomAction`) where it applies. | Judgment |
| Only internal Convex functions get `returns` validators. Public functions don't need them. | Judgment |
| React: use hooks instead of `useEffect`, and keep `useState` to a minimum. | Judgment |
| Keep the code plain: no abstractions for one use, and JSDoc only where it helps. Never write a comment per line. | Judgment |
| Ask the operator for approvals in a few short tl;dr lines. | Judgment |
| `convex env list` prints secret values, so print only names: `pnpm exec convex env list \| cut -d= -f1`. An exported `CONVEX_DEPLOYMENT` overrides `.env.local`, so check which deployment a command targets. | Judgment |
