---
"owox": minor
---

# OWOX Data Marts API access

Add the OWOX Data Marts API access layer for external tools and automation.
This includes [`owox-ctl`](../docs/api/owox-ctl.md), the OWOX Data Marts Control CLI for automation-first JSON commands against existing OWOX Data Marts deployments, and [`@owox/api-client`](../docs/api/api-client.md), a TypeScript/JavaScript API client for custom integrations.

`owox-ctl` resolves credentials from environment variables, loads `.env` or `--env-file`, reports the absolute env file path when one is loaded, defaults to OWOX Data Marts Cloud at `https://app.owox.com`, and supports:

- `owox-ctl status`
- `owox-ctl data-marts list`
- `owox-ctl data-marts stream`
- `owox-ctl storages list`
- `owox-ctl destinations list`
