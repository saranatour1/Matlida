# Guidelines

How this project is built, and the conventions to follow when changing it. For people and AI agents alike.

## What it is

You create **projects**. Each project has a **lead**, who goes by the project's name (the first project is "Matilda"), plus a team of **employees** you add yourself. The lead answers your chats and delegates to employees, asking several in parallel when a topic spans their areas. When a reply is a deliverable, the lead saves it as an **artifact**.

Project settings that shape the bots:

- **Brief**: what the project is about. Only the lead sees it.
- **Guidelines**: rules the lead and every employee always follow.
- **Employee description and custom fields**: what that one employee knows and how they work.

## Stack

- **TanStack Start** on Vite (React 19, file-based routes in `src/routes/`)
- **Convex** for the database, server functions and realtime updates
- **`@convex-dev/agent`** for agents, threads, messages and streaming
- **Convex AI Gateway** (`@convex-dev/ai-sdk-provider`) for model calls. Convex holds the provider keys; it needs a paid Convex plan
- **shadcn/ui** (`base-rhea` style, built on Base UI) and **Tailwind CSS v4**. The chat UI comes from [shadcn-ui/chatbot-template](https://github.com/shadcn-ui/chatbot-template)

## Running it

```bash
pnpm install
pnpm dev          # Convex dev (watches convex/) + Vite on http://localhost:3000
pnpm typecheck    # run before every commit
pnpm build        # typecheck + production build
pnpm format       # prettier
```

`pnpm lint` and `pnpm start` don't work yet (see `tasks.md`).

## Where things live

```
convex/
  schema.ts          tables: projects, employees, threads, artifacts
  matilda.ts         the lead: sendMessage → respond (streams the reply), lead tools, listMessages
  projects.ts        list / get / save projects
  employees.ts       list / save / remove employees, shared `clean()` validation helper
  threads.ts         app-side index of agent threads (chats and lead→employee talks)
  artifacts.ts       documents the lead saves
  convex.config.ts   mounts the agent component
src/
  routes/
    index.tsx                              /  projects: list, create, edit
    p.$projectId.index.tsx                 /p/:id  chat (?thread=…)
    p.$projectId.team.tsx                  /p/:id/team  employees and templates
    p.$projectId.threads.$threadId.tsx     read-only lead→employee thread
    p.$projectId.artifacts.$artifactId.tsx artifact preview
  components/
    ui/              shadcn components, generated: edit sparingly
    parts/           one component per message part (text, ask_employee, save_artifact)
    app-sidebar.tsx  projects, then the current project's bots, chats, threads, artifacts
    chat.tsx, chat-message.tsx, prompt-form.tsx
  hooks/use-project.ts      the project from the URL
  lib/employee-templates.ts ready-made employees shown on the Team page
```

Messages themselves live in the agent component's tables, not ours. Our `threads` table only records which project a thread belongs to, what kind it is (`chat` or `employee`) and its parent chat, so the sidebar can list them.

## How a reply happens

1. `matilda.sendMessage` (mutation) checks the prompt, creates the chat thread on the first message, saves the user message, and schedules `respond`.
2. `matilda.respond` (action) loads the project and its team, then builds the lead **for this reply**: name, instructions (brief, roster, guidelines) and tools. So edits to the team or project apply to the next reply without a deploy.
3. The lead streams its answer with `saveStreamDeltas`. The UI reads it live through `useUIMessages(api.matilda.listMessages, …, { stream: true })`.
4. `ask_employee` starts a new employee thread, runs that employee as their own agent, and returns `{ name, role, reply }`. `save_artifact` stores markdown and returns `{ id, title }`.

## Recipes

**Add an employee template.** Add an entry to `src/lib/employee-templates.ts`. Nothing else is needed.

**Add a lead tool.**

1. Create it with `createTool` inside `leadTools()` in `convex/matilda.ts`. Built there, it can use the project and team.
2. Mention it in `leadInstructions()` if the lead needs to know when to use it.
3. Add its input/output types to `ChatUIMessage` in `src/components/chat-message.tsx`.
4. Add a part component in `src/components/parts/` and a `case 'tool-<name>'` in `ChatMessage`. Handle each `part.state`: `input-streaming`, `input-available`, `output-available` and `output-error`.

**Add a page inside a project.** Create `src/routes/p.$projectId.<name>.tsx`. Get the project with `useProject()`. Link with `<Link to="/p/$projectId/…" params={{ projectId }} />`. The route tree regenerates while `pnpm dev` runs.

**Add a shadcn component.** Run `pnpm exec shadcn add <name>`, answer **no** to overwriting existing files, then `pnpm format`. The aliases in `components.json` point at `~/`.

**Change the schema when data already exists.**

- A new field that may be empty: add it as `v.optional(...)` (like `projects.guidelines`).
- A new required field: deploy it as optional first, run a one-off `internalMutation` to backfill, then make it required and delete the migration (this is how `projectId` was added).

## Conventions

**Convex**

- Read `convex/_generated/ai/guidelines.md` before writing Convex code. It overrides older habits.
- Every function has `args` and `returns` validators. Functions only our own code calls are `internal*`.
- Queries use an index and a bound (`.withIndex(...)` plus `.take(n)`). No unbounded `.collect()`.
- Public mutations are a trust boundary. Trim and length-check user input (see `clean()` in `employees.ts`), and throw `ConvexError` with a message the UI can show as-is.
- Model calls run in actions, through `convexGateway(...)`. Never put a provider key in the client.

**Frontend**

- Imports use the `~/` alias for `src/`. Convex code is imported relatively (`../../convex/_generated/api`).
- Prettier style: no semicolons, single quotes, trailing commas.
- Reach for native elements before adding a library (`<details>`, `<datalist>`, `FormData`).
- Every interactive element needs an accessible name, such as an `aria-label` on icon buttons.
- Keep the layout working at phone width. The sidebar turns into a sheet below 768px.

**Agents and prompts**

- Instructions are assembled in `convex/matilda.ts`. Project-wide rules belong in the project's Guidelines field, not in code.
- Employees can't see the chat, so the lead has to put all needed context in its question.

**Security**

- There's no auth yet. All projects, teams, chats and artifacts are visible to anyone with the URL, and every message spends gateway credits. Don't deploy publicly until auth and rate limiting land (see `tasks.md`).

**Workflow**

- Branch off `master` and open a pull request. Don't commit straight to `master`.
- Run `pnpm typecheck` before committing, and check UI changes in the browser.
- After each piece of work, tick or add items in `tasks.md` and add a dated entry to `progress.md`.
