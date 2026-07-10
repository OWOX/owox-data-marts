# MCP Observability (ee/mcp/observability, Layer A)

Instruments every MCP tool call at the SDK `registerTool` callback (the choke point): `McpCallInstrumentation.wrap()`
times the call, reads CLS-scoped `McpLogContext` (project/user/client/session/request) and per-call
`McpToolDiagnostics` (e.g. `executedSql`), builds one structured `mcp.tool_call` event via `buildMcpToolCallEvent`
(OTel-shaped attributes, input/output redacted), and hands it to `OwoxEventDispatcher.publishExternalSafely`.

The boundary with `packages/internal-helpers` (Layer B) is that Layer B knows nothing MCP-specific: it exposes a
generic `createEventBusFromEnv(env, extras)` (logger/posthog transports from `INTEGRATIONS_TRANSPORTS`, plus
whatever `extras.extraTransports`/`extras.offloader` the caller injects). `mcp-bus-wiring.ts` in this directory is
the composition-root glue — it reads `MCP_LOG_*`/`MCP_OTEL_ENABLED`, builds the MCP offloader and (when enabled)
the MCP OTLP transport via `buildMcpBusExtras()`. `McpBusExtrasModule` (`@Global`) provides that value under
the `BUS_EXTRAS` token so `common`'s `ProducerModule` can inject it optionally — without importing `ee` — and
pass it into `createEventBusFromEnv`.
Instrumentation code itself (`mcp-call-instrumentation.ts`) still knows nothing about transports, GCS, or OTLP —
it only produces one MCP-domain event per call and puts bulky fields (SQL, results) under the offloader's
`OFFLOAD_KEY` so the offloader can send them to GCS instead of inlining them.

**Reliability invariant:** instrumentation is best-effort and out of the tool's response path — `wrap()` never
changes the wrapped callback's result or error, and `emit()` swallows its own exceptions, so a logging failure
can never surface as a tool-call failure.

**Known gap:** the SDK validates a tool call's arguments against its input schema *before* the wrapped callback
runs, so calls rejected by schema validation emit no `mcp.tool_call` event (no t1/t2 trace). Only calls that
reach the handler are instrumented.

**PII default:** tool `arguments`/`result`/`sql` can carry client data, so they are kept out of the general
logs by default — dropped when no bucket is set, or offloaded to GCS (`MCP_LOG_GCS_BUCKET`, ADC-gated) when it
is. Only identity/status/duration/error stay inline. Set `MCP_LOG_INLINE_PAYLOADS=true` to opt into inlining
small payloads into logs/OTLP (accepting client data in logs); `MCP_LOG_INLINE_MAX_BYTES` bounds that.
To enable OTLP export, set `MCP_OTEL_ENABLED=true` and `OTEL_EXPORTER_OTLP_ENDPOINT` (see root `.env.example`).

These `MCP_*`/`OTEL_*` vars are read from `process.env` via a small zod schema in `mcp-bus-wiring.ts` (the
composition root), NOT through `McpConfigService` — deliberately, to avoid a DI cycle with `EeModule`. The
generic transport/offloader mechanics are documented in
`packages/internal-helpers/src/integrations/event-bus/README.md`.

## Loading offloaded payloads into BigQuery

Each offloaded tool call is written to one self-describing NDJSON record at
`gs://<bucket>/mcp/<UTC-date>/<project>/<request>-<nonce>.json` (the nonce avoids same-request collisions),
joinable with the event log on `owox_request_id`. The `*.json` load glob below matches them all.

Target-table DDL (heterogeneous fields load as BigQuery `JSON` columns):

```sql
CREATE TABLE mydataset.mcp_calls (
  owox_request_id STRING, owox_project_id STRING, owox_conversation_id STRING,
  owox_conversation_id_is_pseudo BOOL, mcp_tool_name STRING, mcp_method_name STRING,
  mcp_tool_status STRING, occurred_at TIMESTAMP,
  arguments JSON, result JSON, sql STRING
);
```

Load statement:

```sql
LOAD DATA OVERWRITE mydataset.mcp_calls
FROM FILES (format = 'JSON', uris = ['gs://<bucket>/mcp/*.json']);
```

`arguments`/`result` are heterogeneous per tool → BigQuery `JSON` type; query them with
`JSON_VALUE`/`JSON_QUERY`, and join to the event log on `owox_request_id`. Client `_meta` is not
persisted raw — only redacted, flattened `meta_*` keys appear on the event.
