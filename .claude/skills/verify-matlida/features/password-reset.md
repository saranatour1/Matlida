# Password reset

A user who forgot their password asks for a reset link, opens it in the same browser, chooses a new password, and is signed in with it. Their old password stops working.

## Sub-features

- `forgot-open` opens the forgot-password form from the sign-in page.
- `forgot-validate` rejects a bad email with `Enter a valid email address.`.
- `forgot-send` emails a reset link and shows `Check your email`.
- `reset-mismatch` rejects a new password whose confirmation differs.
- `reset-complete` changes the password, signs the user in, and emails a `Your password was changed` notice.
- `reset-bad-link` shows `This link can't be used` for a bad or used link.

## How to get to it (user POV)

- From `/sign-in`, choose the `Forgot your password?` link.
- Open `/forgot-password` directly.
- Open the emailed link, which lands on `/reset-password?code=…`.

## Driving it with verify-matlida

Preconditions:

- The baseline from [README.md](./README.md) holds.
- [Sign up](./sign-up.md) ran in this run, so `$EMAIL` has a verified account with `$PASSWORD`, and the user then signed out.
- `$NEW` is a second password, made with `openssl rand -base64 18` and saved to `$RUN/password-reset/new-password`.

- **Open.** On `/sign-in`, `left_click` the `Forgot your password?` link. The heading reads `Forgot your password?`.
- **Validate.** Set `Email` to `not-an-email` and `left_click` `Send reset link`. The page shows `Enter a valid email address.`.
- **Send.** Set `Email` to `$EMAIL` and submit. The page shows `Check your email` and `We sent a reset link to $EMAIL`.
- **Open the link.** Run `verify.sh email-link $EMAIL > $RUN/password-reset/link.txt` right away, then `navigate` to that URL in the same pane. After `Checking your link…`, the heading reads `Reset your password`, with `New password` and `Confirm password` fields.
- **Mismatch.** Set `New password` to `$NEW` and `Confirm password` to `$NEW` with an `x` appended, then `left_click` `Reset password and sign in`. The page shows `The passwords don't match.`.
- **Complete.** Set both fields to `$NEW` and submit. The page shows `Password changed`, then lands on `/` with `$EMAIL` on the home card.
- **Notice stored.** `verify.sh convex data --component resend emails --format jsonl --limit 3` includes a row to `$EMAIL` with the subject `Your password was changed`.
- **Old password fails.** Sign out, then sign in with `$PASSWORD`. The page shows `Wrong email or password.`. Signing in with `$NEW` reaches `/`.
- **Bad link.** Sign out, then `navigate` to `http://localhost:3100/reset-password?code=bogus`. The page shows `This link can't be used` and a `Send a new link` link.
- **Proof.** Save `read_page` and the screenshot after `Complete` as `$RUN/password-reset/home.aria.txt` and `$RUN/password-reset/home.jpg`, along with the emails query output.

## Gotchas

- Run `email-link` straight after `Send`. Once the password changes, the newest email to `$EMAIL` is the notice, which has no link.
- The reset link expires after 10 minutes and only works in the browser that asked for it.
- An account that only signed in with Google or GitHub has no password to reset.
