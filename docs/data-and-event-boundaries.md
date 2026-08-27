# Data and Event Boundaries

This document is the repository-local source for ODM persistence and event
delivery. The OWOX Factory system map owns only the cross-repository routing.

## Database Topology

ODM initializes two named TypeORM data sources.

### Main data source

The default connection owns ordinary application persistence for ODM modules.
Its contract is configured through the main `DB_*` or SQLite variables and the
main migration history.

### Plugin collections data source

The named `pluginCollections` connection owns only:

- plugin collection documents;
- plugin collection usage;
- plugin collection audit events.

Its entities and migrations live under
`apps/backend/src/plugin-host/collections/`. It uses the independent
`plugin_collections_migrations` migration table. Health checks query both data
sources, and dump/migration commands deliberately initialize both.

Every `PLUGIN_COLLECTIONS_*` option falls back to the corresponding main
database option when blank. Therefore local and self-hosted deployments can use
the same physical SQLite file or MySQL database while retaining two logical
connections. OWOX Cloud overrides the connection to the separate
`owox-data-marts-plugins` MySQL instance through the `OWOX/k8s` deployment.

`RUN_MIGRATIONS` applies pending up migrations to both histories. A down
migration targets only one data source and requires the explicit
`MIGRATIONS_DATA_SOURCE` selection for `pluginCollections`; do not assume the
histories advance or roll back together.

Plugin collection documents are arbitrary plugin-owned JSON. Treat them as
potentially sensitive and high-cardinality data. Do not copy the full collection
store into logs or internal analytics without an explicit field list, purpose,
access model, PII decision, retention, and backfill plan.

## ODM Event Delivery

Application code publishes cross-cutting product events through
`OwoxEventDispatcher` and the integration EventBus. The default integration
transport is `logger`.

The logger transport writes a structured OWOX event envelope containing the
event name, `occurredAt`, payload, producer, version, and ordering value. In the
OWOX-managed runtime, structured logs reach Google Cloud Logging; a separately
managed GCP log sink can then route selected events to internal BigQuery.

ODM owns event names, payload schemas, event occurrence time, dispatcher usage,
and tests. The deployed GCP sink owns log selection and the physical analytics
destination. Verify the sink before claiming that a new event reaches a
particular dataset.

Keep event payloads bounded and stable. The existing payload offloader
stringifies nested object/array values where Cloud Logging-to-BigQuery schema
inference could otherwise conflict, and can offload or drop bulky or sensitive
fields. Never log credentials, tokens, or unrestricted plugin collection JSON.

## Choosing an Internal Analytics Path

- Use an existing ODM event when its semantics already match the required
  analytical transition.
- Add a focused ODM event through the dispatcher/logger route for new sparse
  product facts.
- Use an explicitly owned MySQL-to-BigQuery replication path when analytics
  needs relational state, broad table coverage, or backfill rather than a
  business event.

For replication, name `main` or `pluginCollections` plus the exact table. Do not
assume the production connection topology from local fallback behavior.

## Validation Pointers

For datasource changes, cover configuration fallback, both database types where
relevant, migration selection, and health behavior. For event changes, cover the
event mapper/envelope and the domain action that dispatches it. Use the narrowest
workspace commands from `docs/contributing/testing.md`.
