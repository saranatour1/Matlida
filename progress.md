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
