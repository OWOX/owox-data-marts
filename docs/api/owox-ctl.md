# owox-ctl

`owox-ctl` is the OWOX Data Marts Control CLI for scripts, CI jobs, and AI agents.

By default, `owox-ctl` connects to OWOX Data Marts Cloud at `https://app.owox.com`.
Set `OWOX_API_ORIGIN` only when targeting a self-managed deployment.

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

Set the API key credentials in the process environment:

```bash
export OWOX_API_KEY_ID=pmk_xxx
export OWOX_API_KEY_SECRET=your_api_key_secret
```

For self-managed deployments, also set the API origin:

```bash
export OWOX_API_ORIGIN=https://your-owox.example.com
```

API origin means scheme + host + optional port.

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

The command validates credentials, reports the API key ID, and reports the env file path used for the command.

Example:

```json
{
  "apiOrigin": "https://app.owox.com",
  "apiKeyId": "pmk_1234567890abcdef",
  "authenticated": true,
  "envFile": null
}
```

With auto-loaded `.env`, `envFile` is the default path used:

```json
{
  "apiOrigin": "https://app.owox.com",
  "apiKeyId": "pmk_1234567890abcdef",
  "authenticated": true,
  "envFile": "/path/to/project/.env"
}
```

With `--env-file ../../.env`, `envFile` is the resolved absolute path.

When credentials are missing or invalid, `authenticated` is `false` and the command exits non-zero:

```json
{
  "apiOrigin": "https://app.owox.com",
  "apiKeyId": null,
  "authenticated": false,
  "envFile": null,
  "error": {
    "message": "OWOX_API_KEY_ID and OWOX_API_KEY_SECRET are required",
    "name": "OWOXConfigError"
  }
}
```

## Commands

```bash
owox-ctl data-marts list
owox-ctl storages list
owox-ctl destinations list
```

All commands emit JSON.

## Use owox-ctl with AI agents

AI agents can call `owox-ctl` as a regular terminal command. This lets AI agents inspect available data marts, storages, and destinations without building a direct integration with the OWOX Data Marts API.

Recommended setup:

```bash
export OWOX_API_KEY_ID=pmk_xxx
export OWOX_API_KEY_SECRET=your_api_key_secret
```

Examples for AI agents:

```bash
owox-ctl status
owox-ctl data-marts list
owox-ctl storages list
owox-ctl destinations list
```

Security notes:

- Do not put API key secrets into AI agent instruction files.
- Prefer environment variables, `--env-file`, or a secret manager supported by the AI agent runtime.
- Revoke API keys when AI agent access is no longer needed.

## Build custom integrations

If you need to call OWOX Data Marts from TypeScript or JavaScript code instead of shell commands, use [@owox/api-client](./api-client/).
