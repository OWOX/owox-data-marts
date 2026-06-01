# API Keys

API keys let external tools authenticate with OWOX Data Marts without an interactive browser session.

Use API keys with:

- [owox-ctl](./owox-ctl/)
- [@owox/api-client](./api-client/)
- CI and automation scripts
- AI agents
- custom scripts and internal tools

Each API key has two parts:

- API key ID
- API key secret

The API key secret is shown only when the key is created. Store it securely.

API keys are associated with project access. Available data and actions depend on the permissions granted to the project member who owns the key.

## Create an API key

1. Open your OWOX Data Marts project.
2. In the project menu, open **Project settings → My API Keys**.
3. Click **Create API Key**.
4. Enter a **Name**.
5. Optionally set **Expires (optional)**.
6. Click **Create**.
7. In the **API Key Created** dialog, copy the **API Key ID** and **API Key Secret**.
8. Store the API key secret securely.
9. Click **I have saved the secret**.

The API key secret is shown only once.

Do not share API key secrets in chat, email, screenshots, support tickets, prompts, or repository files.

## Use an API key

After creating an API key, use it with one of the supported API access options:

- [owox-ctl](./owox-ctl/) for terminal, CI, automation, and AI agent workflows that need JSON command output.
- [@owox/api-client](./api-client/) for TypeScript or JavaScript integrations.
- [OpenAPI and Swagger UI](./openapi/) for inspecting the raw HTTP API contract.

## Revoke or rotate API keys

1. Open **Project settings → My API Keys**.
2. Find the API key.
3. Open the row actions menu.
4. Click **Revoke**.
5. In the **Revoke API Key** dialog, click **Revoke**.

After an API key is revoked, tools using that key can no longer authenticate.

Rotate a key by creating a new API key, updating the tool or automation that uses it, and revoking the old key.

## Security recommendations

- Create separate API keys for different users, tools, or automation contexts.
- Do not commit API key secrets to Git.
- Do not store API key secrets in prompts, AI agent instruction files, screenshots, or support tickets.
- Prefer environment variables or secret managers for CI and AI agents.
- Revoke keys that are no longer used.
- Rotate keys if the secret may have been exposed.

## Related docs

- [owox-ctl](./owox-ctl/)
- [@owox/api-client](./api-client/)
- [OpenAPI and Swagger UI](./openapi/)
