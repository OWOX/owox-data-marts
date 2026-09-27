---
'owox': minor
---

**Custom no-code connectors**

Build a connector to any REST API without writing code. A declarative manifest describes the
API — authentication, pagination, nodes and fields — and a three-pane web builder edits it with
live testing against the real endpoint. Connectors are versioned: publish, roll back, and bind
them to Data Marts alongside the built-in ones. Title, description and documentation link stay
editable; the name is fixed once the connector exists, because a Data Mart references its
connector by name — deleting a connector frees its name to be used again. A connector's
manifest is readable by editors only — it is author-written JSON that can hold a credential
typed straight into the builder — while the connector list, its configuration form and its
field schema stay open to viewers. Publishing a version, or making another version active,
changes what runs in every Data Mart that follows the connector's active version, so it needs
edit access to each of those Data Marts; otherwise a project admin can do it.

**Fixes**

- **Multi-account imports** — one account failing no longer ends the run. The remaining
  accounts are imported and their data is delivered. An account the API refuses with a 401 or
  403 is skipped and named in a warning; any other failure fails the run at the end, with every
  failure named. Previously the first failure stopped the run and every account after it was
  skipped without explanation.
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
- **Data Mart connector setup** — picking a connector, then another, then the first one again
  showed the second one's settings. The form now always shows the settings of the connector
  picked last.
- **Open Exchange Rates** — a run with an invalid App ID, or over its quota, now fails. It used
  to finish successfully with no rows and move on, so those days were never imported.
- **GitHub** — a 401 or 403 now fails the run. It used to write a row with an empty id.

Data Marts on these two connectors that looked healthy may start failing: they had been
importing nothing, or for GitHub an empty row.

**For operators**

Three new environment variables, all optional:

- `MAX_CONNECTOR_TESTS_PER_PROJECT` (default 3) — live connector tests one project may run at once.
  Each test runs in its own process.
- `MAX_CONNECTOR_TESTS_TOTAL` (default 10) — live connector tests one backend instance may run at
  once, across all projects. The cap is per instance, so N replicas admit up to N times this.
- `CONNECTOR_RUN_LOG_FLUSH_INTERVAL_MS` (default 2000) — how often a running connector's logs and
  errors are written to the database. Run logs now appear while the run is still going; `0` turns
  that off and writes them once, when the run ends.

**For developers using `@owox/connectors`**

Every connector now runs through one shared engine. The per-connector `…Connector` classes
(`GoogleAdsConnector`, `FacebookMarketingConnector` and the rest) and `AbstractConfig`,
`AbstractRunConfig`, `NodeJsConfig` and `HttpUtils` are no longer exported. A source's
`fetchData` receives one node, one account and one date window, and the engine does the
rest; see the package's `CREATING_CONNECTOR.md`.

<!-- markdownlint-disable-file MD041 MD036 -->
