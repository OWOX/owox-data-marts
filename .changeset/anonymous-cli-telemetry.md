---
"owox": minor
---

# Anonymous CLI usage telemetry

`owox serve` now sends a single anonymous event on successful startup so OWOX can understand how many people run the server and prioritize accordingly.

The data is fully anonymous — a random identifier (not derived from your machine or network), CLI/Node versions, OS platform/arch, and Docker/IDP/web flags. No hostnames, file paths, emails, environment values, or IP-derived identity are ever collected.

Telemetry is opt-out. Disable it by setting `OWOX_TELEMETRY_DISABLED=1` or the cross-tool standard `DO_NOT_TRACK=1`. It is also automatically disabled in CI. See [Self-Managed Editions → Anonymous Usage Analytics](../docs/editions/self-managed-editions.md) for details.
