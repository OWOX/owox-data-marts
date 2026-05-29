# owox-ctl

`owox-ctl` is the OWOX Data Marts Control CLI for accessing an existing OWOX Data Marts instance through API keys.

> `owox-ctl` controls an existing OWOX Data Marts instance through the HTTP API.
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

## Authenticate

For local interactive use, run:

```bash
owox-ctl auth login
```

The command prompts for:

- OWOX Data Marts API origin
- API key ID
- API key secret

Example prompt:

```text
OWOX Data Marts API origin: https://app.owox.com
API key ID: pmk_xxx
API key secret: ********
```

API origin means scheme + host + optional port, for example `https://app.owox.com`.

`owox-ctl auth login` validates credentials before saving them. It stores API origin, API key ID, and API key secret in the platform-specific OWOX application config directory under `ctl/config.json`. The file is created as readable and writable only by the current user where supported.

`owox-ctl` does not persist access tokens. Access tokens are kept in memory only for the current command.

Flag-based login is available for tests and scripted setup:

```bash
owox-ctl auth login \
  --api-origin https://app.owox.com \
  --api-key-id pmk_xxx \
  --api-key-secret your_api_key_secret
```

For local interactive use, prefer `owox-ctl auth login` without flags so the API key secret is not saved in shell history.

## Check authentication status

```bash
owox-ctl auth status
```

The command validates credentials and masks sensitive values.

Example:

```text
API origin: https://app.owox.com
API key ID: pmk_1234...
Authenticated: yes
```

## Log out

```bash
owox-ctl auth logout
```

This removes locally stored CLI credentials.

## Use environment variables

```bash
export OWOX_API_ORIGIN=https://app.owox.com
export OWOX_API_KEY_ID=pmk_xxx
export OWOX_API_KEY_SECRET=your_api_key_secret
```

Then run:

```bash
owox-ctl data-marts list --format json
```

Environment variables take precedence over credentials saved by `owox-ctl auth login`.

CI jobs and local agents do not need to run `owox-ctl auth login`.

You can also load these variables from an environment file:

```bash
owox-ctl data-marts list --env-file .env --format json
```

Values already present in the process environment take precedence over values loaded from the environment file.

## Use owox-ctl with local agents

Local agents can call `owox-ctl` as a regular terminal command. This lets agents inspect available data marts, storages, and destinations without building a direct integration with the OWOX Data Marts API.

Recommended setup:

```bash
export OWOX_API_ORIGIN=https://app.owox.com
export OWOX_API_KEY_ID=pmk_xxx
export OWOX_API_KEY_SECRET=your_api_key_secret
```

Agent-friendly examples:

```bash
owox-ctl data-marts list --format json
owox-ctl storages list --format json
owox-ctl destinations list --format json
```

Security notes:

- Do not put API key secrets into agent instruction files.
- Prefer environment variables or a secret manager supported by the agent runtime.
- Use `--format json` when an agent needs machine-readable output.
- Revoke API keys when agent access is no longer needed.

## First supported commands

```bash
owox-ctl data-marts list
owox-ctl storages list
owox-ctl destinations list
```

## Output formats

```bash
--format table
--format json
```

`table` is the default for humans.

`json` is recommended for scripts, CI jobs, and local agents. JSON output does not use color.

Use `--no-color` to disable color output for human-readable output.

## Build custom integrations

If you need to call OWOX Data Marts from TypeScript or JavaScript code instead of shell commands, use [@owox/api-client](./api-client/).
