# Matilda auth.md

For agents and the people who run them.

## Registration

Matilda has no agent registration. There is no registration or provisioning endpoint, no OAuth server for third parties, and no way for an agent to get its own credentials.

## Supported methods

- **Public pages, no credentials:** `/`, `/sign-in`, `/sign-up`, `/llms.txt`, `/auth.md` and `/openapi.json`. Send `Accept: text/markdown` to get the first three as markdown. `/.well-known/api-catalog` lists them.
- **Signing in, people only:** a person signs in with GitHub in a browser at https://matilda-is-a-bot.app/sign-in.

## Credentials

Sessions belong to the person who signed in. Don't ask a person for their session or their GitHub credentials, and don't use them on their behalf. Workspaces, chats and reminders aren't available to agents.
