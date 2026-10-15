# Tasks

## Done

- [x] Install shadcn/ui and port the chat UI from `shadcn-ui/chatbot-template`
- [x] Matilda: Convex Agent that delegates to employees in parallel, via the Convex AI Gateway
- [x] Employees are user-managed: add, edit and remove them on `/team`
- [x] Custom fields per employee (Tone, KPIs, Budget...), fed into that employee's instructions
- [x] Sidebar with Bots, Chats, Threads (Matilda ↔ employee) and Artifacts, each linking to a preview
- [x] Artifacts: Matilda saves deliverables as markdown docs (`save_artifact` tool), viewable at `/artifacts/$id`
- [x] Read-only thread preview at `/threads/$threadId`
- [x] Show "Matilda is thinking…" until her reply starts, without flashing the empty state

## Open

- [ ] Auth: everything is public and shared (team, chats, artifacts), and every message spends gateway credits
- [ ] Rate limiting on `matilda.sendMessage` (`@convex-dev/rate-limiter`)
- [ ] Stop button (abort the streaming reply)
- [ ] Employee memory: each ask starts a fresh employee thread; reuse one per (chat, employee) if needed
- [ ] Delete or rename chats and artifacts from the sidebar
- [ ] Shared field definitions, if per-employee fields with suggested labels aren't enough
- [ ] Fix `pnpm start`: it runs `.output/server/index.mjs`, but `pnpm build` writes `dist/server/server.js`
- [ ] Install `eslint` so `pnpm lint` works
- [ ] Starter hydration warning in the console: `Error reading query stream ... 'mutations'` (`@tanstack/react-router-with-query`)
- [ ] Decide the `allowBuilds` placeholders in `pnpm-workspace.yaml` (every install currently warns)
