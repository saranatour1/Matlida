---
name: verify-matlida
description: Launch Matilda (TanStack Start web app on Convex) against an isolated local Convex backend and drive its browser UI the way a user does, to prove sign-up, sign-in, password reset or OAuth changes work. Use before claiming a UI or auth change works, or when asked to verify, demo or screenshot the app.
---

# Verify Matilda

Matilda's surface is the web UI at `http://localhost:3100` (sign-up, sign-in, password reset, Google/GitHub buttons, and a signed-in home card). Everything here runs through one helper:

```bash
.claude/skills/verify-matlida/verify.sh <launch | doctor | account | email-link <to> | convex <args> | cleanup>
```

Run it from the checkout under test. Every command works from any directory inside it.

## Why a local backend

- The cloud dev deployment is shared. The user's own dev server (`pnpm dev`, port 3000) pushes code to it, so a second `convex dev` would overwrite their functions. Never verify against it.
- This session's environment can export the cloud deployment's `CONVEX_DEPLOYMENT`, `VITE_CONVEX_URL` and auth secrets, and those win over `.env.local`. The helper unsets them. Plain `pnpm exec convex ...` or `vite` does not: it hits the cloud. Use `verify.sh convex ...` instead.
- With the backend local (`127.0.0.1:3210`) and the page on localhost, test credentials never leave the machine.

## Launch

1. Work in a git worktree that has no `.env.local` of its own, for example a Claude Code session worktree under `.claude/worktrees/`. `launch` refuses when `.env.local` points at a cloud deployment.
2. Run `verify.sh launch`. Starting from nothing, it:
   - installs deps if `node_modules` is missing;
   - creates an anonymous local Convex deployment (state in `.convex/local/default`, ports 3210/3211) and writes `.env.local`;
   - sets its env vars: `SITE_URL=http://localhost:3100`, a fake `RESEND_API_KEY` so no email is delivered, dummy OAuth client IDs, and fresh signing keys;
   - runs `convex dev --start "vite dev --port 3100 --strictPort"` in the background, logging to `test-results/verify/<run>/dev.log`.
3. It's ready when it prints `ready: http://localhost:3100` and `run dir: …`. It waits for `Convex functions ready` and for `/sign-in` to serve `<title>Matilda`. That is the server being up. The app is usable once the browser shows the heading `Welcome back` at `/sign-in`.

The schema has no seed data. Each journey creates the account it needs with `verify.sh account`.

Isolation: one verify run per machine, because ports 3100, 3210 and 3211 are fixed. `launch` refuses when any of them is taken. A verify run can sit next to the user's cloud-backed dev server on port 3000.

## Doctor

Run `verify.sh doctor` first, and again whenever something looks off. It changes nothing. It prints the checkout and commit, checks that the deployment is local, that ports 3210 and 3100 belong to processes in this checkout, that `SITE_URL` is `http://localhost:3100`, and that `/sign-in` serves Matilda. Each problem prints as a `FAIL` line, and the exit code is 0 only when the instance is worth driving.

## Drive

Use the in-app browser pane tools (`mcp__Claude_Browser__*`). Without them, follow the same steps with the `anthropic-skills:chrome-browser` skill.

- Go to a page: `navigate` with `http://localhost:3100/<route>`.
- Find a control: `find` with its accessible name (`Email`, `Password`, `Create account`), then act on the returned `ref`.
- Type: `form_input` with the `ref` and the value. Click: `computer` `left_click` with the `ref`.
- Check the result: `get_page_text`, or `read_page` for the ARIA tree. After a navigation or submit, wait for the heading you expect with `javascript_tool`. A submit can take a few seconds, and the old page stays on screen until it finishes. `for (let i = 0; i < 20 && document.querySelector('h1')?.textContent !== 'Check your email'; i++) await new Promise(r => setTimeout(r, 500)); ({ url: location.href, h1: document.querySelector('h1')?.textContent })`. The home card has no heading, so wait on `location.pathname === '/'` there.
- Credentials: `verify.sh account` prints `email=` and `password=` for this run, saved in `<run>/account.env`. They are local test values. Type them into forms, but never paste them into replies.
- Email links: `verify.sh email-link <email>` prints the newest link the app emailed to that address, read from the local database. Open it with `navigate` in the same browser pane, because a link only works in the browser that asked for it.
- Backend state: `verify.sh convex data users --format jsonl`, or `verify.sh convex data --component resend emails --format jsonl`.

The recipes for each feature are in [features/README.md](features/README.md).

## Evidence

Write proof to `test-results/verify/<run>/<feature-id>/`. The run dir is printed by `launch`, and `test-results/verify/latest` points to it. `/test-results/` is gitignored, and cleanup never touches it.

For each proof, capture:

- the ARIA tree from `read_page`, saved as `<step>.aria.txt`, with a first line naming the feature ID and URL;
- a screenshot: the `computer` `screenshot` result names its source `.jpg`, so copy that file in;
- the side effect from a second view, such as the `users` row (`verify.sh convex data users --format jsonl > users.jsonl`) or the stored email;
- `dev.log` from the run dir, if the step failed.

Proof standards:

- Go through the real user path: forms, links and emailed links. Don't call Convex functions to fake a step.
- Capture both the action and the state it produced, not only the last screen.
- Check side effects (rows, emails) alongside what's on screen.
- The only fake is the email send. `RESEND_API_KEY` is fake on purpose, so every email ends `failed` with a Resend 401, and nothing is delivered. The message and its link are still stored, which is what `email-link` reads. Delivery itself stays unproven locally.

## Cleanup

1. Sign out in the browser pane if a journey left you signed in.
2. Run `verify.sh cleanup`. It kills the process tree that `launch` started (its PID is in `<run>/dev.pid`), deletes `.convex/local` and `.env.local` (only when they're the local deployment), and prints where the evidence was kept. The next `launch` starts from an empty database.

Never kill the dev server on port 3000, or anything this run didn't start.

## Helpers

| Command | Does |
| --- | --- |
| `verify.sh launch` | Creates and configures the local deployment if needed, starts Convex and Vite, and waits until they're ready. |
| `verify.sh doctor` | Read-only health check. Exit 0 means the instance is ready to drive. |
| `verify.sh account` | Prints this run's test email and password, creating them on first use. |
| `verify.sh email-link <to>` | Prints the newest link emailed to `<to>`. Exit 1 if there is none. |
| `verify.sh convex <args>` | Runs the Convex CLI against the local deployment, for example `convex data users`. |
| `verify.sh cleanup` | Stops the run's processes and wipes the local deployment. Evidence stays. |

## Gotchas

- `convex env list` prints secret values. To see which env vars are set, print only the names: `verify.sh convex env list | cut -d= -f1`.
- The first `launch` on a machine may download the Convex local backend binary.
- Google and GitHub sign-in can't finish locally: the client IDs are dummies, and an agent never types provider passwords. See [features/oauth.md](features/oauth.md).
