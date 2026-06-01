# @owox/ctl

OWOX Data Marts Control CLI for scripts, CI jobs, and AI agents.

## Install

```bash
npm install -g @owox/ctl
```

## Usage

```bash
OWOX_API_KEY_ID=pmk_xxx \
OWOX_API_KEY_SECRET=xxx \
owox-ctl data-marts list
```

```bash
owox-ctl status --env-file .env
```

`owox-ctl` also loads `.env` from the current directory when it exists and reports the absolute path in `envFile`.

All command output is JSON. The default API origin is `https://app.owox.com`.

## Documentation

[owox-ctl API documentation](https://docs.owox.com/docs/api/owox-ctl/).
