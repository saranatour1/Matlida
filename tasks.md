# Tasks

## Done

- [x] Install shadcn/ui and port the chat UI from `shadcn-ui/chatbot-template`
- [x] Matilda: Convex Agent that delegates to employees in parallel, via the Convex AI Gateway
- [x] Employees are user-managed: add, edit and remove them on the Team page (`/p/$projectId/team`)
- [x] Custom fields per employee (Tone, KPIs, Budget...), fed into that employee's instructions
- [x] Sidebar with Bots, Chats, Threads (Matilda ↔ employee) and Artifacts, each linking to a preview
- [x] Artifacts: Matilda saves deliverables as markdown docs (`save_artifact` tool), viewable at `/p/$projectId/artifacts/$id`
- [x] Read-only thread preview at `/p/$projectId/threads/$threadId`
- [x] Show "Matilda is thinking…" until her reply starts, without flashing the empty state
- [x] Projects: each has a lead (named after the project), a brief, and its own team, chats, threads and artifacts. Existing data moved into the "Matilda" project
- [x] No default employees: teams start empty, and the Team page offers employee templates (Ivy, Sam, Rosa, Leo, Nora) to add with one click
- [x] Project guidelines: rules the lead and every employee in a project always follow
- [x] `GUIDELINES.md` for the codebase, linked from `CLAUDE.md` and `AGENTS.md`
- [x] Guidelines refactor: API files re-export from `convex/models/<table>/`, shared code in `convex/lib/`, Zod input validation via convex-helpers, `returns` only on internal functions, form actions instead of `useEffect`/`useState`
- [x] `docs/integrations.md`: goals and rules for each integration

## Next (in order, see `docs/integrations.md`)

- [ ] pstack as a Claude Code setup (`.claude/skills`, `.claude/agents`)
- [ ] Auth with Convex Auth v2 (alpha, pinned)
- [ ] BYOK AI connections + OpenRouter OAuth
- [ ] Email, send-only: Resend platform email, user connectors (Resend, Postmark, Mailgun, Cloudflare, SMTP, Gmail, Outlook), approval before send, inbound replies
- [ ] Photon: text the lead over iMessage/SMS
- [ ] Calls with Cloudflare RealtimeKit, including the AI lead speaking in calls

## Open

- [ ] Delete a project (and its employees, threads, artifacts and agent messages)
- [ ] Rate limiting on `chat.sendMessage` (`@convex-dev/rate-limiter`)
- [ ] Stop button (abort the streaming reply)
- [ ] Employee memory: each ask starts a fresh employee thread; reuse one per (chat, employee) if needed
- [ ] Delete or rename chats and artifacts from the sidebar
- [ ] Shared field definitions, if per-employee fields with suggested labels aren't enough
- [ ] Fix `pnpm start`: it runs `.output/server/index.mjs`, but `pnpm build` writes `dist/server/server.js`
- [ ] Install `eslint` so `pnpm lint` works
- [ ] Starter hydration warning in the console: `Error reading query stream ... 'mutations'` (`@tanstack/react-router-with-query`)
- [ ] Decide the `allowBuilds` placeholders in `pnpm-workspace.yaml` (every install currently warns)
- [ ] Later: reading mailboxes, outreach texting, AI vision on screen shares, usage tracking per AI connection
