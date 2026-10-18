# Google and GitHub sign-in

The sign-in and sign-up pages offer `Continue with Google` and `Continue with GitHub`. Choosing one sends the user to the provider, and coming back signs them in, with the provider's name, verified email and avatar on the home card.

## Sub-features

- `oauth-google-start` leaves the app for Google's sign-in page.
- `oauth-github-start` leaves the app for GitHub's authorize page.
- `oauth-complete` signs the user in after the provider approves. This can't be driven locally.
- `oauth-error` shows `Sign-in was cancelled.` or `That sign-in took too long. Try again.` when the provider flow fails. This can't be driven locally.

## How to get to it (user POV)

- On `/sign-in` or `/sign-up`, choose `Continue with Google` or `Continue with GitHub`, below the `Or` separator.

## Driving it with verify-matlida

Preconditions:

- The baseline from [README.md](./README.md) holds. The local deployment's OAuth client IDs are `verify-dummy`.

- **Google start.** On `/sign-in`, `left_click` `Continue with Google`. The browser leaves `localhost:3100` for a Google URL whose query has `client_id=verify-dummy`. Google then shows an invalid-client error, which is expected with a dummy ID.
- **GitHub start.** `navigate` back to `http://localhost:3100/sign-in` and `left_click` `Continue with GitHub`. The browser leaves for a `github.com` URL whose query has `client_id=verify-dummy`.
- **Proof.** Record the URL each button reached, with `client_id` visible, in `$RUN/oauth/start-urls.txt`.
- **Complete and error.** Report these as skipped, with the reason `needs real OAuth client IDs and a provider login`. The user checks them on the cloud dev deployment, at port 3000.

## Gotchas

- An agent never types a Google or GitHub password. The full flow is the user's to check.
- The provider's error page is the expected end state locally. Don't count it as a failure of `oauth-*-start`.
- The provider URL is the expected behavior but hasn't been driven yet. Confirm it on the first run and fix this file if it differs.
