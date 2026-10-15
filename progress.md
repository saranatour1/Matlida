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
