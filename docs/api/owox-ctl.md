# owox-ctl

`owox-ctl` is the OWOX Data Marts Control CLI for scripts, CI jobs, and AI agents.

> `owox-ctl` controls an existing OWOX Data Marts deployment through the HTTP API.
> The existing `owox` CLI is used to run or manage a local/self-managed OWOX Data Marts runtime.

## Install

```bash
npm install -g @owox/ctl
```

Verify the installation:

```bash
owox-ctl --help
```

## Create an API key

Before using `owox-ctl`, create an API key. See [API Keys](./api-keys/).

## Configure credentials

Set the API key in the process environment:

```bash
export OWOX_API_KEY=owox_key_xxx
```

The API key contains the API origin, API Key ID, and secret internally. Store the full `owox_key_...` value securely.

## Load credentials from an env file

`owox-ctl` loads `.env` from the current directory when it exists. You can load a different environment file with `--env-file`:

```bash
owox-ctl status --env-file .env
```

Values already present in the process environment take precedence over values loaded from an environment file.

## Check status

```bash
owox-ctl status
```

The command validates credentials, reports the API key ID, reports the env file path used for the command, and returns the project and member context resolved from the exchanged access token.

Example:

```json
{
  "apiOrigin": "https://app.owox.com",
  "apiKeyId": "pmk_1234567890abcdef",
  "authenticated": true,
  "envFile": null,
  "project": {
    "id": "project-1",
    "title": "Demo Project"
  },
  "member": {
    "userId": "user-1",
    "email": "user@example.com",
    "fullName": "User Example",
    "avatar": null,
    "roles": ["viewer"]
  }
}
```

With auto-loaded `.env`, `envFile` is the default path used:

```json
{
  "apiOrigin": "https://app.owox.com",
  "apiKeyId": "pmk_1234567890abcdef",
  "authenticated": true,
  "envFile": "/path/to/project/.env",
  "project": {
    "id": "project-1",
    "title": "Demo Project"
  },
  "member": {
    "userId": "user-1",
    "email": "user@example.com",
    "fullName": "User Example",
    "avatar": null,
    "roles": ["viewer"]
  }
}
```

With `--env-file ../../.env`, `envFile` is the resolved absolute path.

When the backend does not expose the auth-context endpoint, `status` falls back to credential
exchange only. In that case `authenticated` is still `true` for a valid key, but `project` and
`member` are omitted.

When credentials are missing or invalid, `authenticated` is `false` and the command exits non-zero:

```json
{
  "apiOrigin": null,
  "apiKeyId": null,
  "authenticated": false,
  "envFile": null,
  "error": {
    "message": "OWOX_API_KEY is required and must start with owox_key_",
    "name": "OWOXConfigError"
  }
}
```

## Commands

```bash
owox-ctl status
owox-ctl data-marts list
owox-ctl data-marts stream <dataMartId> --columns '*'
owox-ctl storages list
owox-ctl destinations list
```

Commands emit JSON unless noted; `data-marts stream` emits NDJSON rows.

## Stream Data Mart rows

Use `data-marts stream` to write Data Mart rows to stdout as newline-delimited JSON.
Rows are written as they arrive, so shell redirection and pipelines can handle file output.

```bash
owox-ctl data-marts stream dm_123 --columns '*'
owox-ctl data-marts stream dm_123 --columns '**'
owox-ctl data-marts stream dm_123 --column '*'
owox-ctl data-marts stream dm_123 \
  --column 'Event Date (local)' \
  --column 'Revenue: net = USD' \
  --filter '[{"column":"Event Date (local)","operator":"gte","value":"2026-01-01"}]' \
  --sort '[{"column":"Event Date (local)","direction":"asc"}]' \
  --limit 1000
owox-ctl data-marts stream dm_123 \
  --columns '**' \
  --filter '[{"placement":"pre-join","aliasPath":"users","column":"country","operator":"eq","value":"US"}]' \
  --limit 1000
```

Use `--columns '*'` or `--columns '**'` for column-set selectors. Quote `*` and `**` so your shell does not expand them.

Use repeatable `--column` flags for exact column names. `--column '*'` and `--column '**'` mean literal columns named `*` and `**`.

`--columns '**'` cannot be combined with `--column`. `--columns '*'` can be combined with explicit `--column` values, and overlaps are de-duplicated by the server.

Use `--filter` and `--sort` with JSON arrays. Column names inside filter and sort rules are ordinary JSON string fields, so values can contain spaces, commas, equals signs, and other symbols.

For normal filters on the streamed output, omit `placement` or use `"placement":"post-join"`.

Use `"placement":"pre-join"` only when you need to filter a joined source before it is joined into the result. In that case `aliasPath` identifies which joined source path the filter applies to, for example `"users"` or `"users.profiles"`. Pre-join filters are advanced joined-field filters; they require `aliasPath`, and `aliasPath` is not valid for normal post-join filters.

## Use owox-ctl with AI agents

AI agents can call `owox-ctl` as a regular terminal command. This lets AI agents inspect available data marts, storages, destinations, and Data Mart rows without building a direct integration with the OWOX Data Marts API.

Recommended setup:

```bash
export OWOX_API_KEY=owox_key_xxx
```

Examples for AI agents:

```bash
owox-ctl status
owox-ctl data-marts list
owox-ctl data-marts stream dm_123 --columns '*'
owox-ctl storages list
owox-ctl destinations list
```

Security notes:

- Do not put API keys into AI agent instruction files.
- Prefer environment variables, `--env-file`, or a secret manager supported by the AI agent runtime.
- Revoke API keys when AI agent access is no longer needed.

## Build custom integrations

If you need to call OWOX Data Marts from TypeScript or JavaScript code instead of shell commands, use [@owox/api-client](./api-client/).
