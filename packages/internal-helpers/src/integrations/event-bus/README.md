# Event Bus (integrations/event-bus)

A minimal, non-transactional fan-out event bus used by the integrations layer.
It delivers each event to all configured transports.
Transports are isolated: a failure in one transport is logged and does not prevent others from sending.

## Environment configuration

- Variable name: `INTEGRATIONS_TRANSPORTS` (exported in code as `INTEGRATIONS_TRANSPORTS_ENV`).
- Purpose: Controls which transports are enabled.
- Format: Comma-separated list of transport names.
- Default: `logger` (used when the variable is absent, empty, or invalid).

Examples:

- .env

  ```env
  INTEGRATIONS_TRANSPORTS=logger
  ```

- Multiple transports (future-proof example)

  ```env
  INTEGRATIONS_TRANSPORTS=logger,posthog
  ```

## Supported transports

- `logger` — Writes structured event messages to the application logger.
- `posthog` — Sends `TelemetryEvent` instances to the PostHog capture API. No-op for non-telemetry events.

Additional transports can be added in `transports/` and wired into `createEventBusFromEnv`'s
`config.enabledTransports` switch.

### Extras (caller-injected transports and offloader)

`createEventBusFromEnv(env, extras)` takes an optional second argument,
`EventBusExtras { extraTransports?: EventTransport[]; offloader?: PayloadOffloader }`. This package has
no knowledge of MCP, OTLP, or GCS — domain-specific wiring (e.g. the MCP `otlp` transport and GCS-backed
offloader) is assembled by the composition root and passed in as `extras`. See
`apps/backend/src/ee/mcp/observability/mcp-bus-wiring.ts` for the MCP example: it builds the `otlp`
transport (env-gated on `MCP_OTEL_ENABLED=true` + `OTEL_EXPORTER_OTLP_ENDPOINT`) via `OtlpTransport` +
`createOtlpEmitter`, filtered to events whose name starts with `mcp.`
(`OtlpTransportOptions.eventNamePrefixes`), and the `PayloadOffloader` from `MCP_LOG_GCS_BUCKET` /
`MCP_LOG_INLINE_MAX_BYTES`.

`OtlpTransport` turns each matching event into a completed OTel span via `OtlpSpanEmitter`. The real
emitter (`createOtlpEmitter`) lazily `import()`s the `@opentelemetry/*` packages, which are
`optionalDependencies` of `internal-helpers`; if they're not installed or the emitter isn't wired, it
resolves to `undefined` and the transport is a no-op. Emission is best-effort — failures are logged and
swallowed, never thrown into the fan-out.

### `PayloadOffloader`

`PayloadOffloader` (in `integrations/blob-store`) moves a bulky field out of an event payload
before fan-out. Producers put the bulky value under the reserved `OFFLOAD_KEY`
(`'__offload__'`) key; `EventBus.produceEvent` calls `offloader.apply(payload)`, which deletes that
key and, depending on `sink`, either inlines it (`sink: 'inline'`, under a caller-supplied
`inlineMaxBytes`, else marked `owox_payload_truncated`), uploads it to GCS via a caller-supplied
`GcsBlobStore` + `pathBuilder` and replaces it with `owox_payload_ref` (`sink: 'gcs'`), or drops it
(`sink: 'none'`, not env-selectable — used only when a `PayloadOffloader` is constructed directly). It
never throws — offload errors degrade to an `owox_payload_error` marker so the event is still emitted.
This package builds no `PayloadOffloader` from env itself; the caller (e.g. `mcp-bus-wiring.ts`) resolves
its own env vars and constructs one, passed in via `extras.offloader`.

## Core concepts

- Event: Extend `BaseEvent<TPayload>` to define a specific event type with a name and payload.
- Transport: Implements `EventTransport` and the `send()` method.
- Bus: `EventBus` fans out events to all enabled transports.
