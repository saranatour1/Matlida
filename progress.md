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

## 2026-10-15 (later): BYOK AI connections

### Built

- **`aiConnections` table** (`convex/models/aiConnections/`): an owner, a label, the kind (`apiKey` or `openrouterOAuth`), the provider, a default model, the encrypted secret, the last 4 characters of the key, and a status.
- **Encryption** (`convex/lib/crypto.ts`): AES-256-GCM through WebCrypto. The key comes from `SECRETS_KEY`, which is declared in `convex.config.ts` and set on dev. The owner id is the additional data, so a ciphertext can't move to another account. It's decrypted only in actions, and clients only ever see the last 4 characters.
- **Model resolution** (`convex/lib/ai.ts`): `resolveModel` picks the project's connection (Anthropic, OpenAI, Google or OpenRouter, with an optional per-project model) or falls back to the Convex AI Gateway. The lead and its employees share that model.
- **Rejected keys:** `checkApiKey` makes one cheap call when a key is saved. If a provider later answers 401/403, the connection is marked `invalid` and a message saying so is added to the thread. There's no silent fallback to the gateway.
- **OpenRouter OAuth (PKCE):** `src/lib/openrouter.ts` starts the sign-in. `/settings/openrouter` finishes it with a button, so no `useEffect` is needed.
- **UI:** a Settings page (link in the sidebar footer), shadcn `native-select`, and an AI picker plus model field on the project form. The picker only renders once connections have loaded, so it can't clear a saved choice.
- **Housekeeping:**
  - `pnpm-workspace.yaml` overrides `@ai-sdk/provider` to 4.0.28 and `@ai-sdk/provider-utils` to 5.0.61. There were four copies, which split the model types.
  - `allowBuilds` is decided: `esbuild: true`, `unrs-resolver: false`.

### Verified (in the browser, as dev-other)

- A fake Anthropic key was rejected by the real API with "Anthropic didn't accept that key." Nothing was stored, and the form kept everything except the key.
- **Runtime path:** a fake key stored by a temporary helper (deleted after the test) was decrypted and sent to Anthropic. The thread said "Anthropic rejected the API key…", and Settings flagged the key.
- **Project form:** it preselects the saved connection. Switching to the gateway cleared it, and the next chat answered through the gateway.
- **Removing** the connection works.
- **OpenRouter:**
  - "Connect OpenRouter" reached OpenRouter's sign-in.
  - The callback page reported a refused code, then "This sign-in expired", because the verifier is single-use.
- **Not yet tested:** a successful chat with a real key or an OpenRouter account.

## 2026-10-15 (later): email, send-only

### Built

- **`emailConnections` table:** `config` is a union by kind (resend, postmark, mailgun with domain and region, cloudflare with account ID, smtp with host, port and username). The secret is encrypted with the shared `vEncryptedSecret`, which `aiConnections` now uses too.
- **Sending:**
  - The HTTP providers are called with `fetch` from `models/emailConnections/api.ts`, which also checks credentials when a connection is saved.
  - SMTP runs in a `"use node"` action with nodemailer. Port 465 uses TLS and 587 uses STARTTLS, with timeouts. The action decrypts the password itself, so plaintext never appears in function arguments.
- **The lead's `send_email` tool** (`needsApproval: true`) is offered only when the owner has a working connection. It returns `{ sent, … }` or `{ sent: false, error }`. A 401/403 from the provider marks the connection invalid.
- **Approvals:**
  - `chat.decide` saves the answer with `approveToolCall` or `denyToolCall`, then schedules the lead to continue.
  - `EmailPart` shows the draft with Send and Don't send buttons, then its outcome.
- **Bug found:** @convex-dev/agent 0.7.7 rejects approval continuations once a thread holds an older approval. `keepCurrentApprovals` (the lead's `contextHandler`) keeps only the current approval's parts and drops older unanswered tool calls. A suggested task drafts the upstream issue.
- **Settings:** an Email section with the connection list and an add form. The fields change with the provider, and the provider picker is the only state.

### Verified (in the browser, as dev-other)

- A fake Resend key was rejected by the real API, and the form kept its values.
- **SMTP** with bad credentials against smtp.gmail.com:587 returned Gmail's real "535 Username and Password not accepted". So the Node action, STARTTLS and outbound networking all work.
- **Approvals**, using fake connections stored by a temporary helper (deleted after the test):
  - Don't send: nothing was sent, and the lead acknowledged it.
  - Send after an earlier approval in the same thread first hit the agent bug. After the workaround, the tool ran, Resend rejected the fake key, the connection was marked invalid, and the card showed "wasn't sent: Resend rejected the saved credentials."
- **Not yet tested:** real delivery, which needs a working key or SMTP account.

## 2026-10-18: Auth beta, gateway-only AI

### Changed

- **Auth:** upgraded `@convex-dev/auth` from `2.0.0-alpha.2` to `2.0.0-beta.0`.
  - New import paths: `@convex-dev/auth/server`, `methods/username-password/*`, `components/*/convex.config.js`.
  - `setupCore` became `setupConvexAuth`. The sign-in functions became `signInWithUsernamePassword` and `signUpWithUsernamePassword`, and the hooks take `api.auth`.
  - The password component is now mounted as `authPassword`.
  - The core's `sessions` schema changed, so the dev sessions were cleared to deploy. The old test accounts (`dev-owner`, `dev-other`) lost their passwords with the component rename; `dev-beta` replaces them.
- **AI:** BYOK is removed. Leads and employees run on the Convex AI Gateway only (`lib/ai.ts`).
  - Gone: `aiConnections`, OpenRouter sign-in, the AI picker and the `@ai-sdk/*` providers.
  - Gone too: the pnpm override for `@ai-sdk/provider`, which no longer has conflicting types to unify.
  - Email credentials still use `lib/crypto.ts` and `SECRETS_KEY`.

### Verified

- `pnpm typecheck`, `pnpm build` and `npx convex dev --once` pass.
- In the browser: a new account signed up on the beta, created a project, and the lead answered through the gateway.
