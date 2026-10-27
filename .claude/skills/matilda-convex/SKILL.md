---
name: matilda-convex
description: How to confirm Convex work in Matilda is correct, what each Convex component (agent, workflow, crons, aiBudget, rateLimiter, resend, spectrum, auth, shopping, study) does in this app, and every model it reaches through the Convex AI gateway. The details are in docs/skills/convex/convex.md. Use it before calling any change under convex/ done, when asked which deployment a command hits, what a component is for, which model does a job, or how to change or add a model or component. Use it even for a small Convex change.
---

# Matilda on Convex

`docs/skills/convex/convex.md` is the reference. Read the section you need:

- **Confirming the work**: the steps from "which deployment am I on" to logs and insights, in order.
- **Components**: what each `app.use(...)` in `convex/convex.config.ts` does here, and where it's used.
- **AI gateway**: how calls reach it, how they're metered, and the model behind each job and in the model menu.

## Before you say Convex work is done

1. Say which deployment `convex` commands will hit: `echo $CONVEX_DEPLOYMENT`, then `grep CONVEX_DEPLOYMENT .env.local`. The exported one wins.
2. Run `pnpm check` and `pnpm test`. Both must pass. The tests mock every model, so they prove logic, not model behavior. If the change depends on a real model, also try it on an authenticated local deployment (step 6 of the page).
3. Check the change at runtime, as far as it reaches. If it writes rows, read them back with `convex data`. If it could conflict or retry, look at `convex insights`. If it's a call, read `api/calls:dump`, and never place one.
4. Report what you ran and what you didn't.

Be careful with deployments:

- Dev and prod are shared, so check which one a command will hit before you run it.
- Production writes, deploys and env changes need the operator's OK each time.
- `convex env list` prints secret values, so pipe it through `cut -d= -f1`.

## Keeping the page true

When a change adds or removes a component, or changes a model id, update the page in the same PR:

- **Components:** `grep '^app.use' convex/convex.config.ts` must match the Components table, both ways. A new row gives the package, what it does here, and where it's used as `file:symbol`.
- **Models:** `grep -oE "'[a-z0-9~-]+/[a-z0-9.~-]+'" convex/lib/models.ts` must match the ids in "Models by job" and "Chat models in the model menu", both ways.
- **References:** each `file:symbol` on the page must still resolve: `grep -w <symbol> <file>`. If it doesn't, find where it went with `git log -S<symbol>`.

Write "What it does here" about Matilda, not about the package in general. "Durable steps for `/run` tasks and call turns" tells the next agent where to look. "Workflow engine" doesn't.
