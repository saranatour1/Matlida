# Progress

## 2026-10-12

### Built

- **UI**: shadcn/ui (`base-rhea` style) with the chatbot template's components: message scroller, bubbles, markdown with Shiki code blocks, prompt form. Plus the shadcn sidebar. Template's Next.js pieces were adapted to TanStack Start (`~/` alias, no `"use client"`, Google Fonts instead of `next/font`).
- **Matilda** (`convex/matilda.ts`): a Convex Agent on `anthropic/claude-sonnet-4.5` through the Convex AI Gateway (no API key; needs a paid Convex plan). On every reply she loads the current team and gets two tools:
  - `ask_employee`: runs that employee as their own agent in a new thread and returns `{ name, role, reply }`. She calls it several times in one step to ask people in parallel.
  - `save_artifact`: stores a markdown deliverable and returns `{ id, title }`.
- **Team** (`convex/employees.ts`, `/team`): employees live in the `employees` table with name, role, description and custom fields. Names are unique; max 20 people and 10 fields each. Field-name inputs suggest labels already used on the team.
- **Sidebar** (`src/components/app-sidebar.tsx`): Bots, Chats, Threads, Artifacts, all live Convex queries. The app-owned `threads` table records each chat and each Matilda ↔ employee thread, with the parent chat.
- Starter demo removed (`anotherPage`, `myFunctions`, `numbers` table). The original four employees (Ivy, Sam, Rosa, Leo) were inserted into the dev database as editable starter data.

### Verified (dev deployment, in the browser)

- `pnpm typecheck` and `pnpm build` pass.
- Added an employee (Nora, Head of Sales, custom field "Quarterly target: $150k in new ARR") on `/team`; she showed up in the sidebar right away.
- Asked Matilda to consult Nora and Rosa and save a plan: both were asked in parallel, the replies used their custom fields ($150k target, $20k budget), and the "Q4 Sales Action Plan" artifact appeared in the sidebar.
- Opened the artifact preview and the Matilda → Nora thread preview; checked the mobile sidebar sheet.

### Notes

- Old test chats from before the team moved to the database aren't in the `threads` table, so they don't appear in the sidebar.
- Port 3000 was taken by another server during testing, so `.claude/launch.json` runs Convex + Vite on 3001. `pnpm dev` is unchanged.
- Open items are in `tasks.md`.

## 2026-10-15

### Built

- Pushed the work so far to the `matilda-chat` branch (only the first commit was on GitHub).
- **Projects** (`convex/projects.ts`, `/`): a project has a name and a brief. Its lead goes by the project's name and gets the brief in their instructions; the lead's behavior stays built-in. Employees, threads and artifacts now carry a required `projectId`.
- Migrated existing data in two deploys: optional `projectId` plus a one-off mutation that created the "Matilda" project and assigned every row to it, then made `projectId` required and deleted the migration.
- Routes moved under the project: `/p/$projectId` (chat), `/p/$projectId/team`, `/p/$projectId/threads/$threadId`, `/p/$projectId/artifacts/$artifactId`. `/` lists projects and creates or edits them.
- Sidebar: a Projects section on top, then Bots (lead + employees), Chats, Threads and Artifacts for the current project. `useProject()` reads the project from the URL.

### Verified (dev deployment, in the browser)

- `pnpm typecheck` passes.
- Created project "Oscar" (coffee roastery brief) and added Bea (Head Roaster) on its Team page; Matilda's employees didn't show there.
- Chatted with Oscar: "Oscar is thinking…" showed, Oscar asked Bea, and the reply used the brief. The sidebar showed only Oscar's lead, bot, chat and thread.
- Switched to the Matilda project: her five employees, chat, two threads and the "Q4 Sales Action Plan" artifact were all there, and the artifact preview opened at its new URL.

### Employee templates

- Teams start empty. The Team page lists templates (`src/lib/employee-templates.ts`): Ivy (Marketing), Sam (Engineering), Rosa (Finance), Leo (Operations & People) and Nora (Sales). "Add" saves a copy into the project, which can then be edited; added templates drop out of the list.
- Removed the five starter employees I had inserted into the Matilda project, so it starts empty too.
- Verified in the browser: added Sam from a template, saw him join the team and leave the template list, then removed him.

### Guidelines

- **Project guidelines**: a new optional `guidelines` field on projects, edited on the Projects page. It's appended to the lead's instructions and to every employee's. Optional, so existing projects needed no migration.
- Verified in the browser: set Oscar's guidelines to "Always reply in French", asked Oscar to consult Bea, and both Oscar's answer and Bea's reply came back in French. Then cleared the test rule.
- **`GUIDELINES.md`** for the codebase: stack, commands, file map, how a reply flows, recipes (templates, lead tools, pages, shadcn components, schema changes) and conventions. Linked from `CLAUDE.md` and `AGENTS.md`, outside the Convex-managed block.

## 2026-10-15 (later): guidelines refactor

### Built

- **Convex layout** follows ianmacartney/code-organization-pattern:
  - API files `convex/{projects,employees,threads,artifacts,chat}.ts` only re-export.
  - Definitions live in `convex/models/<table>/{table,functions}.ts`, and the lead agent in `models/threads/{lead,chat}.ts`.
  - Table-agnostic code lives in `convex/lib/` (`zMutation`, the AI model).
  - `api.matilda.*` is now `api.chat.*`.
- **Validation:**
  - Public mutations that take user text use `zMutation` (convex-helpers `zCustomMutation` + Zod 4), with messages meant for users.
  - `threads.kind` uses `literals()`.
  - `returns` validators remain on internal functions only.
- **Updates:** convex-helpers 0.1.128 added. Convex 1.46 and agent 0.7.7 are already the latest. Convex AI files updated.
- **Frontend:**
  - Forms use `<form action>` + `useActionState`, and keep the submitted values on error.
  - `useIsMobile` uses `useSyncExternalStore`.
  - No `useEffect` is left in our code. Only two `useState` calls remain: the copy button and the field rows.
  - Removed the template's "d" theme hotkey and an unused `safeHttpUrl`.
- **Docs:**
  - `GUIDELINES.md` rewritten around the owner's rules.
  - `docs/integrations.md` sets the goals and rules for auth, BYOK, email, Photon and calls.

### Verified

- `pnpm typecheck`, `npx convex dev --once` and `pnpm build` pass.
- In the browser (Oscar test project):
  - Added Ivy from a template.
  - A duplicate name ("Bea") showed "Bea is already on the team." and kept every input, including the custom field row.
  - A name of only spaces showed the Zod message "Give the employee a name."
  - A valid save cleared the form.
  - A chat asked Bo and Ivy in parallel and saved "Weekend Tasting Event Plan" as an artifact.

## 2026-10-15 (later): pstack for Claude Code

### Built

- `scripts/port-pstack.mjs` copies pstack (MIT, cursor/plugins) into `.claude/skills/` and `.claude/agents/` and rewrites the Cursor-specific parts:
  - `Task` → `Agent`, and `generalPurpose`/`readonly` → `general-purpose`/`Explore`.
  - `environment: "cloud"` → `isolation: "worktree"`.
  - Model slugs → `<model>/<effort>` (Grok → `sonnet`).
  - `cursor-team-kit` skills → `/simplify` and `run`; `create-skill` → `skill-creator`.
  - `.cursor/` paths → `.claude/`.
  - Guide links → GitHub.
- The script fails if any Cursor reference is left, or if a `SKILL.md` lacks a kebab-case name and a description. It's rerunnable, to pull upstream updates.
- Model routing per role lives in `.claude/skills/poteto-mode/models.md` and replaces `setup-pstack`.
- **Left out:** `setup-pstack`, `make-bot-ui` (Grok Bot), `automations/benny` (Cursor Automations), and pstack's `unslop`, because a personal `unslop` skill already exists and would win.
- `.claude/` is excluded from `tsc` and prettier. `CLAUDE.md` and `AGENTS.md` point to `/poteto-mode`.

### Verified

- The script's own checks pass, and `pnpm typecheck` passes.
- A fresh `claude -p` session sees the `comment-sicko` agent.
- `/poteto-help` loads and answers from the ported text. Most skills are `disable-model-invocation`, so they load when typed rather than appearing in Claude's own list. That's how pstack is designed.

## 2026-10-15 (later): auth

### Built

- **Convex Auth v2** (`@convex-dev/auth@2.0.0-alpha.2`, pinned):
  - The core, password and username components are mounted.
  - `convex/auth.ts` sets up the password provider.
  - `convex/auth.config.ts` points to the component's JWKS.
  - `npx @convex-dev/auth` put the signing keys on the dev deployment.
- **Signed-in only:** `convex/lib/functions.ts` now has `authedQuery`, `authedMutation`, `authedAction` and `zAuthedMutation`, built with convex-helpers `customCtx`. Every public function uses them, and `zMutation` is gone.
- **Ownership:**
  - `projects.ownerId` is required, with an index on it.
  - `getOwnedProject` and `getOwnedThread` guard employees, threads, artifacts and chat.
  - Agent threads carry the owner's `userId`.
- **Migration:** `ownerId` was added as optional, a one-off `claimProjects` gave the existing Matilda and Oscar projects to the `dev-owner` test account, then it was made required and the migration deleted.
- **UI:**
  - `AuthScreen` is one form with Sign in and Create account buttons, using `useActionState`. The submitter's `intent` picks the flow, and every error code maps to a message.
  - The root layout is gated with `<Authenticated>` and `<Unauthenticated>`.
  - The sidebar footer shows the username and a sign-out button.
  - Projects and threads you don't own show "not found".

### Verified (in the browser)

- Signing in to an account that doesn't exist showed "No account with that username…" and kept the username.
- Created `dev-owner`, claimed the old projects, and the session survived a reload.
- An Oscar chat asked Bea and got an answer.
- Signing out returned to the sign-in screen with no console errors.
- `dev-other` sees no projects, and gets "Project not found" on Oscar's URL.
- `npx convex run projects:list` and `employees:list` without a user both fail with "Sign in first."
- Test account credentials are in `.env.local`, which git ignores.
