# Webhooks

Webhooks allow you to receive real-time notifications when events occur in OWOX Data Marts. When an event is triggered, OWOX sends an HTTP POST request with a JSON payload to your configured URL.

## Setting Up a Webhook

1. Navigate to **Notifications** in the left sidebar.
2. Select the notification type you want to configure (e.g., _Failed runs_).
3. Enter your endpoint URL in the **Webhook URL** field.
4. Click **Test** to verify your endpoint is reachable.
5. Click **Save** to activate the webhook.

---

## IP Allowlist

All webhook requests originate from a fixed IP address. If your endpoint is behind a firewall or requires IP allowlisting, add the following address:

```text
34.38.103.182
```

---

## Request Format

Every webhook request is a `POST` with the following headers:

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `User-Agent`  | `OWOX-DataMarts-Webhook/1.0` |
| `X-Webhook-ID` | Unique event ID (UUID) |
| `X-Event-Type` | Event type string (e.g. `owox.data-marts.webhook.data_mart.run.failed`) |

---

## Payload Structure

All events share the same envelope:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "version": "1",
  "event": "<event-type>",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "isTest": true,
  "data": { ... }
}
```

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique event ID (UUID). Use for deduplication. |
| `version` | string | Payload schema version. Currently `"1"`. |
| `event` | string | Event type identifier. |
| `timestamp` | string | ISO 8601 timestamp of when the event was generated. |
| `isTest` | boolean | Present and `true` only for test events sent via the **Test** button. Omitted for real events. |
| `data` | object | Event-specific payload. |

---

## Events

### `owox.data-marts.webhook.data_mart.run.failed`

Triggered when a data mart run fails.

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "version": "1",
  "event": "owox.data-marts.webhook.data_mart.run.failed",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": {
    "projectId": "my-project-id",
    "projectTitle": "My Project",
    "dataMart": {
      "id": "dm-abc123",
      "title": "Sales Report",
      "url": "https://app.owox.com/ui/my-project-id/data-marts/dm-abc123"
    },
    "run": {
      "id": "run-xyz789",
      "status": "FAILED",
      "startedAt": "2024-01-15T10:29:00.000Z",
      "finishedAt": "2024-01-15T10:30:00.000Z",
      "errors": [
        "Query execution failed: table not found"
      ]
    }
  }
}
```

---

### `owox.data-marts.webhook.data_mart.run.successful`

Triggered when a data mart run completes successfully.

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "version": "1",
  "event": "owox.data-marts.webhook.data_mart.run.successful",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": {
    "projectId": "my-project-id",
    "projectTitle": "My Project",
    "dataMart": {
      "id": "dm-abc123",
      "title": "Sales Report",
      "url": "https://app.owox.com/ui/my-project-id/data-marts/dm-abc123"
    },
    "run": {
      "id": "run-xyz789",
      "status": "SUCCESSFUL",
      "startedAt": "2024-01-15T10:29:00.000Z",
      "finishedAt": "2024-01-15T10:30:00.000Z",
      "durationMs": 60000,
      "rowsProcessed": 15000
    }
  }
}
```

---

## Responding to Webhooks

Your endpoint must return a `2xx` HTTP status code within **10 seconds**. Any other response or a timeout is treated as a failure.

---

## Testing Your Endpoint

Use the **Test** button in the notification settings to send a sample event to your endpoint. Test events have `"isTest": true` in the payload and use the same structure as real events, so you can use them to validate your integration immediately.
