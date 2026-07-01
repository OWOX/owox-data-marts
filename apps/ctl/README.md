# @owox/ctl

OWOX Data Marts Control CLI for scripts, CI jobs, and AI agents.

## Install

```bash
npm install -g @owox/ctl
```

## Usage

```bash
OWOX_API_KEY=owox_key_xxx \
owox-ctl data-marts list
```

```bash
owox-ctl status --env-file .env
```

`owox-ctl` also loads `.env` from the current directory when it exists and reports the absolute path in `envFile`.

All command output is JSON. The API origin is encoded inside `OWOX_API_KEY`.

## Documentation

[owox-ctl API documentation](https://docs.owox.com/docs/api/owox-ctl/).
