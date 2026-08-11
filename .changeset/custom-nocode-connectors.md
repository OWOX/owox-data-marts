---
'owox': minor
---

# Custom no-code connectors

Build a connector to any REST API without writing code. A declarative manifest describes the
API — authentication, pagination, nodes and fields — and a three-pane web builder edits it with
live testing against the real endpoint. Connectors are versioned: publish, roll back, and bind
them to Data Marts alongside the built-in ones. A connector's manifest is readable by editors
only — it is author-written JSON that can hold a credential typed straight into the builder —
while the connector list, its configuration form and its field schema stay open to viewers.

AI assistants connected over MCP can do the same — discover connectors, author and test a
manifest, publish it, run a connector Data Mart and watch the result — and hand you a link to
open the connector in the builder.

Connector fixes included in this release:

- **LinkedIn Ads** — account ids are sent as bare numbers again, so catalog imports stop being
  rejected as malformed.
- **Microsoft Ads** — `offline_access` is restored on the refresh-token grant, so refresh tokens
  rotate reliably again.
- **Run failures** — clearer error messages and stricter date parsing: a manual backfill with an
  unreadable date now fails immediately instead of quietly importing nothing. A failure the
  connector itself flags as a warning is now recorded once, as a warning, instead of also being
  logged as an error.
- **Run status** — a run is reported successful only when every configuration succeeded. A run
  where some configurations failed is now reported as failed instead of successful, so it shows as
  failed in Run History and triggers the failed-runs notification, which is on by default.
- **Credential rotation** — when a refreshed credential cannot be saved because the stored one
  changed while the run was executing, Run History now records it. The run previously reported a
  plain success and the next one failed to authenticate with nothing to explain why.
- **Local-egress runs** no longer report themselves as failed.
