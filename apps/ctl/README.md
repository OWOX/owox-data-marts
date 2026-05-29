# @owox/ctl

OWOX Data Marts Control CLI.

`owox` runs and manages a local or self-managed OWOX Data Marts runtime.
`owox-ctl` controls an existing OWOX Data Marts instance through the HTTP API.

The full user documentation lives in
[owox-ctl API documentation](https://github.com/OWOX/owox-data-marts/blob/main/docs/api/owox-ctl.md).

## Install

```bash
npm install -g @owox/ctl
```

## Authentication

For human use, prefer interactive login:

```bash
owox-ctl auth login
```

For CI and agents, use environment variables. These override stored login config
and do not write secrets to disk:

```bash
OWOX_API_ORIGIN=https://app.owox.com \
OWOX_API_KEY_ID=pmk_xxx \
OWOX_API_KEY_SECRET=xxx \
owox-ctl data-marts list --format json
```

You can also load these variables from an environment file:

```bash
owox-ctl data-marts list --env-file .env --format json
```

Access tokens are short-lived and kept in memory only for the current process.
They are never written to the local config file.

## Compatibility

CLI same version as server: supported.
CLI different version from server: best effort.
