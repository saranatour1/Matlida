# Sign up

A visitor creates an account with an email and password, gets a link by email, and opening that link in the same browser signs them in to the home card, which shows their email.

## Sub-features

- `sign-up-validate` shows field errors for a bad email, a short password, or a mismatched confirmation, without creating anything.
- `sign-up-submit` creates the account and shows `Check your email`.
- `sign-up-verify` signs the user in when they open the emailed link, and stores their email on the `users` row.
- `sign-up-other-email` resets the form when the user chooses `Use a different email`.
- `sign-up-bad-link` shows `This link can't be used` for a bad or used link.

## How to get to it (user POV)

- Open `/sign-up` directly.
- From `/sign-in`, choose the `Sign up` link.
- Visit `/` while signed out, which redirects to `/sign-in`, then choose `Sign up`.

## Driving it with verify-matlida

Preconditions:

- The baseline from [README.md](./README.md) holds.
- `verify.sh account` has printed `$EMAIL` and `$PASSWORD`, and no account exists for `$EMAIL`.

- **Open the form.** Run `navigate` to `http://localhost:3100/sign-up`. The heading reads `Welcome to Matilda`, and `find "textbox"` returns `Email`, `Password` and `Confirm password`.
- **Validate.** Using `form_input`, set `Email` to `not-an-email`, `Password` to `short`, and `Confirm password` to `other`, then `left_click` `Create account`. The page shows `Enter a valid email address.`, `Use at least 10 characters.` and `The passwords don't match.`.
- **Mismatch.** Set `Email` to `$EMAIL`, `Password` to `$PASSWORD`, and `Confirm password` to `$PASSWORD` with an `x` appended, then submit. Only `The passwords don't match.` shows. `verify.sh convex data users --format jsonl` prints `There are no documents in this table.`.
- **Submit.** `find "textbox"` again, set `Password` and `Confirm password` to `$PASSWORD`, and `left_click` `Create account`. Wait for the heading `Check your email`, then `get_page_text` shows `We sent a link to $EMAIL`.
- **Email stored.** Run `verify.sh convex data --component resend emails --format jsonl --limit 1`. The newest row has `to` set to `$EMAIL` and the subject `Validate your email address`.
- **Open the link.** Run `verify.sh email-link $EMAIL > $RUN/sign-up/link.txt`, then `navigate` to that URL in the same pane. After `Verifying your email`, the page lands on `/`. `read_page` shows text with `$EMAIL` and a button named `Sign out`.
- **Side effect.** Run `verify.sh convex data users --format jsonl > $RUN/sign-up/users.jsonl`. It has one row whose `email` is `$EMAIL`.
- **Bad link.** `left_click` `Sign out`, which lands on `/sign-in`, then `navigate` to `http://localhost:3100/verify-email?code=bogus`. The page shows `This link can't be used`, `Open the link in the browser where you asked for it.`, and a `Sign up again` link.
- **Other email.** On `/sign-up`, submit the form with `b-$EMAIL` and `$PASSWORD` in both password fields. Wait for `Check your email`, then `left_click` the `Use a different email` link. The heading `Welcome to Matilda` returns, with all three fields empty.
- **Proof.** Save `read_page` as `$RUN/sign-up/home.aria.txt` and copy the screenshot's source `.jpg` to `$RUN/sign-up/home.jpg`. Both must show `$EMAIL` on the home card.

## Gotchas

- An emailed link only works in the browser that started the request. Opened anywhere else, it shows `Open the link in the browser where you asked for it.`.
- Every stored email has `status: failed` with a Resend 401. That's the fake key doing its job, not a bug.
- `email-link` returns the newest email to that address. If a later email went to the same address, the link it returns may not be the one you want.
- No `users` row exists until the link is opened, because the account's first sign-in creates it.
- The form keeps the email after a failed submit, but never the passwords. Re-run `find` and refill both password fields before each submit.
- `Create account` takes a few seconds, and the previous error stays on screen until it finishes. Wait for `Check your email`, and don't read the old error as a failure.
