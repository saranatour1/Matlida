# Matilda verification map

This directory is the maintained source for verifying what a Matilda user can do. Read this index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- `verify.sh launch` printed `ready: http://localhost:3100`, and `verify.sh doctor` exits 0.
- The database starts empty. Each run creates its own account with `verify.sh account`.
- The browser pane is signed out: `/` lands on `/sign-in` with the heading `Welcome back`.
- Never drive an instance this run didn't start. In particular, never drive the user's dev server on port 3000.

## Driving conventions

- Start every recipe from the baseline unless its preconditions say otherwise. A recipe that needs an account runs [Sign up](./sign-up.md) first in the same run.
- Find controls by accessible name with `find`, then act on the `ref`. Never use coordinates.
- Take every quoted name, message and route literally.
- `$EMAIL` and `$PASSWORD` stand for the values `verify.sh account` printed. `$RUN` is `test-results/verify/latest`.
- Sign out at the end of a journey, so the next one starts signed out.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof is an ARIA tree from `read_page` plus a screenshot, saved under `$RUN/<feature-id>/`.
- Mutation proof includes a second view of the stored value, such as a `users` row or a stored email.
- Record the feature ID and entry point with every artifact.
- Report an unreachable path with the attempted step and the unmet precondition.
- Never report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the behavior a user sees. It then has exactly four H2 sections, in this order:

1. `Sub-features`: short IDs, one line per behavior.
2. `How to get to it (user POV)`: every entry point a user has.
3. `Driving it with verify-matlida`: starts with `Preconditions:`, then labeled bullets that pair each user action with exact tool calls and the observable result.
4. `Gotchas`: traps that can waste or invalidate a run.

## Features

- [Sign up](./sign-up.md): email and password sign-up, validation, and the emailed verification link. Every sub-feature proven end to end on 2026-10-19.
- [Sign in and sign out](./sign-in.md): the sign-in form, wrong credentials, route guards and sign-out. Not yet proven end to end; the route guards and sign-out were seen on 2026-10-19.
- [Password reset](./password-reset.md): the forgot-password email, the reset link, and signing in with the new password. Not yet proven.
- [Google and GitHub sign-in](./oauth.md): the provider buttons. Only the start of the flow can be driven locally. Not yet proven.
