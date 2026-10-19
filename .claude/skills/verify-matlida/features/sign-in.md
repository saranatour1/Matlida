# Sign in and sign out

A user with a verified account signs in with their email and password and reaches the home card. Signed-out visitors are kept out of the app, and signed-in users are kept off the auth pages.

## Sub-features

- `guard-signed-out` redirects a signed-out visit to `/` to `/sign-in`.
- `sign-in-validate` shows field errors for an empty form.
- `sign-in-wrong` rejects a wrong password with `Wrong email or password.`.
- `sign-in-ok` signs in and shows the home card with the user's email.
- `guard-signed-in` sends a signed-in visit to `/sign-in` back to `/`.
- `sign-out` ends the session and returns the user to `/sign-in`.

## How to get to it (user POV)

- Open `/sign-in` directly, or visit `/` while signed out.
- From `/sign-up`, choose the `Sign in` link.
- Sign out with the `Sign out` button on the home card.

## Driving it with verify-matlida

Preconditions:

- The baseline from [README.md](./README.md) holds.
- [Sign up](./sign-up.md) ran in this run, so `$EMAIL` has a verified account with `$PASSWORD`, and the user then signed out.

- **Guard, signed out.** `navigate` to `http://localhost:3100/`. The URL becomes `/sign-in` and the heading reads `Welcome back`.
- **Validate.** `left_click` `Sign in` with both fields empty. The page shows `Enter a valid email address.` and `Enter your password.`.
- **Wrong password.** Set `Email` to `$EMAIL` and `Password` to `$PASSWORD` with an `x` appended, then submit. The page shows `Wrong email or password.`, and `Email` still holds `$EMAIL`.
- **Sign in.** Set `Password` to `$PASSWORD` and `left_click` `Sign in`. The URL becomes `/`, and `read_page` shows `$EMAIL` and a `Sign out` button.
- **Guard, signed in.** `navigate` to `http://localhost:3100/sign-in`. The URL returns to `/`.
- **Sign out.** `left_click` `Sign out`. The URL becomes `/sign-in` and the heading reads `Welcome back`.
- **Proof.** Save `read_page` and the screenshot from the signed-in home as `$RUN/sign-in/home.aria.txt` and `$RUN/sign-in/home.jpg`, and the signed-out page as `$RUN/sign-in/signed-out.aria.txt`.

## Gotchas

- Repeated wrong passwords trip the rate limiter, which shows `Too many tries. Try again in N seconds.`. Use one wrong attempt per run.
- An email with no password account, such as one that only used Google, shows `No account has a password for that email…` instead of `Wrong email or password.`.
- `cleanup` wipes the database, so an account never carries over to the next run.
- The guards render nothing while auth loads. Wait for the heading rather than a fixed delay when the page looks blank.
