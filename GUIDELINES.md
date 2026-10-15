# Guidelines

How we build this project. These rules apply to people and AI agents alike. Integration-specific goals and rules live in [docs/integrations.md](docs/integrations.md).

## Principles

- **Don't over-code.** Write plain, straight code with no detours. Prefer deleting code to adding it. Choose the smallest change that solves the problem.
- **Follow pstack.** Its principles ship as skills in `.claude/skills/principle-*`. Name the one you apply and the decision it changed. The ones we lean on most:
  - Minimize Reader Load
  - Boundary Discipline: validate at the edge, trust types inside
  - Type System Discipline
  - Model the Domain
  - Subtract Before You Add
  - Prove It Works: check the real app, not "it compiles"
  - Fix Root Causes
  - Migrate Callers Then Delete Legacy APIs

  Use `/poteto-mode` for rigorous work.
- **Pick the stack by the job.** Use TanStack Start for full-stack apps and Astro for frontend demos.
- **Ask for approval in tl;dr form.** When you need a decision from the owner, give a few short lines with the options. No essays.

## Stack

| Layer | Choice |
|---|---|
| App framework | TanStack Start on Vite (React 19, file routes in `src/routes/`) |
| Backend | Convex, kept current (`pnpm add convex@latest convex-helpers@latest`, then `npx convex ai-files update`) |
| Agents | `@convex-dev/agent`, called through the Convex AI Gateway (`convex/lib/ai.ts`) |
| UI | shadcn/ui (`base-rhea` on Base UI), with Tailwind CSS v4 |

## Running it

```bash
pnpm install
pnpm dev          # Convex dev + Vite on http://localhost:3000
pnpm typecheck    # before every commit
pnpm build
pnpm format
```

## Convex

### Code organization

We follow [ianmacartney/code-organization-pattern](https://github.com/ianmacartney/code-organization-pattern): define functions in a subfolder, and export the API from a top-level file.

```
convex/
  projects.ts, employees.ts, threads.ts, artifacts.ts, chat.ts
                       the API: re-exports only, e.g. export const { list, get, save } = projectsApi
  models/<table>/
    table.ts           the table definition (imported by schema.ts)
    functions.ts       queries, mutations and actions for that table, exported as one `<table>Api`
                       object, plus helpers that only concern that table (e.g. getTeam, startThread)
  models/threads/lead.ts, chat.ts
                       the lead agent, and the chat functions that run it
  lib/                 reusable, table-agnostic code (the authed function builders, the AI model, crypto, etc.)
  schema.ts            assembles the tables from models/
```

- **`models/<table>`:** add a folder for a table when it gets functions. Use common sense: don't create files that would hold one line.
- **`lib`:** code that more than one model uses, or that has nothing to do with a specific table.
- **Function definitions:** they aren't exported one by one from `models/`, so they only show up under the API file's name (`api.projects.list`). Jump-to-definition goes through the API file to the model.

### Functions

- Every function has an `args` validator.
- **`returns` validators go only on internal functions** (`internalQuery`, `internalMutation`, `internalAction`). Public functions don't declare them.
- **Public functions are for signed-in users.** Build them with `authedQuery`, `authedMutation`, `authedAction` or `zAuthedMutation` from `convex/lib/functions.ts`. These add `ctx.userId`. Check access through the owning project with `getOwnedProject` or `getOwnedThread`, and never take a user id as an argument.
- **User input is validated at the boundary.** Public mutations that take user text use `zAuthedMutation`, with Zod 4 schemas: `.trim().min(1, 'message').max(n, 'message')` and `zid('table')`. A failed parse reaches the UI as a `ConvexError`, and `errorMessage()` in `src/lib/errors.ts` shows its message.
- **Use convex-helpers validators where they fit:**
  - `literals('a', 'b')` instead of a hand-built `v.union(v.literal…)`
  - `nullable`, `partial`
  - `customQuery`/`customMutation` for builders that inject context, such as auth
- **Derive validators from the table:** `threadsTable.validator.omit('threadId').fields` and `schema.doc('table')`.
- **Queries** use an index and a limit (`.withIndex(...).take(n)`). Never `.collect()` unbounded.
- **Merging streams** (`convex-helpers/server/stream`) is only for when one sorted, paginated list has to come from several indexes or tables. Don't reach for it otherwise.
- **Throw `ConvexError('message for the user')`** for errors the user should see.
- **Changing the schema on live data:** deploy the new field as optional, backfill it with a one-off internal mutation, then make it required and delete the migration.
- **Read `convex/_generated/ai/guidelines.md`** before writing Convex code.

## Frontend

- **Hooks first, and no `useEffect`.**
  - Subscribe to browser state with `useSyncExternalStore` (see `src/hooks/use-mobile.ts`).
  - Start work in event handlers or form actions.
  - Read data with `useQuery` and `useUIMessages`.
- **Little `useState`.**
  - Derive values instead of syncing them.
  - Forms are uncontrolled: `<form action={submit}>` with `useActionState`.
  - On error, return the submitted values and use them as `defaultValue`, so React's form reset doesn't wipe them.
  - Keep state only for things the DOM can't hold, like a list of rows.
- **Shared hooks** live in `src/hooks/`, for example `useProject()` for the project in the URL.
- **Style:** shadcn components plus the tokens in `src/styles/app.css`.
  - Use semantic classes (`bg-background`, `text-muted-foreground`, `border`, `rounded-xl`), and no raw colors.
  - Add components with `pnpm exec shadcn add <name>`, answer **no** to overwrites, then run `pnpm format`.
  - `src/components/ui/` is generated: don't restyle it to satisfy these rules.
- **Accessibility:** every control has an accessible name, and layouts work down to phone width (the sidebar becomes a sheet below 768px).
- **Imports:** `~/` for `src/`, and relative paths for `convex/_generated`.

## Comments

Use JSDoc on exports when it adds something: a contract, a constraint, or a non-obvious "why". Don't comment every line or narrate the code. If code needs a long comment to justify it, fix the code instead.

## Recipes

**Add an employee template.** Add an entry to `src/lib/employee-templates.ts`.

**Add a table.**
1. Create `convex/models/<table>/table.ts` and add it to `schema.ts`.
2. Put its functions in `functions.ts`, exported as `<table>Api`.
3. Re-export them from `convex/<table>.ts`.

**Add a lead tool.**
1. Add it with `createTool` in `leadTools()` (`convex/models/threads/lead.ts`), and mention it in `leadInstructions()`.
2. Add its types to `ChatUIMessage` (`src/components/chat-message.tsx`).
3. Add a part component in `src/components/parts/` that handles every `part.state`.

**Add a page inside a project.** Create `src/routes/p.$projectId.<name>.tsx`, get the project with `useProject()`, and link to it with `params={{ projectId }}`.

## Workflow

- Branch off `master`, keep commits small, and open a pull request.
- Before you call something done: run `pnpm typecheck`, deploy with `npx convex dev --once`, and use the change in the browser.
- After each piece of work, tick off or add items in `tasks.md`, and add a dated entry to `progress.md`.
