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

Additional transports can be added in `transports/` and wired in `createEventBusFromEnv`.

## Core concepts

- Event: Extend `BaseEvent<TPayload>` to define a specific event type with a name and payload.
- Transport: Implements `EventTransport` and the `send()` method.
- Bus: `EventBus` fans out events to all enabled transports.
