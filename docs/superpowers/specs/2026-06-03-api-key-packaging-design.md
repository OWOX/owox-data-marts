# API Key Packaging Design

## Context

OWOX Data Marts currently exposes three values after API key creation:

- API Origin
- API Key ID
- API Key Secret

These values are not useful independently for the setup flow. Users must copy and preserve all of them, which increases setup friction for `owox-ctl`, `@owox/api-client`, and automation environments.

Looker Studio destination setup already has a similar user experience where users copy one combined configuration value. API keys should follow the same product principle: users receive one credential and store one credential.

## Decision

Users receive one API Key value:

```text
owox_key_<base64url-json>
```

The decoded payload is minified UTF-8 JSON with exactly these fields:

```json
{"apiOrigin":"https://app.owox.com","apiKeyId":"pmk_xxx","apiKeySecret":"..."}
```

Rules:

- The prefix is `owox_key_`.
- The payload is base64url without padding.
- The payload JSON contains `apiOrigin`, `apiKeyId`, and `apiKeySecret`.
- `apiOrigin` is always included, including for OWOX Data Marts Cloud.
- The API Key is a secret. Base64url is packaging, not encryption.
- API Key ID remains a non-secret operational identifier for status output, logs, debugging, and support.

## Goals

- Give users one credential to copy and store.
- Make shell usage simple: `export OWOX_API_KEY=owox_key_...` works without quotes.
- Keep `owox-ctl` and `@owox/api-client` setup aligned.
- Keep the HTTP authentication exchange contract unchanged.
- Remove separate setup requirements for origin, key ID, and secret.

## Non-Goals

- Do not introduce JWT, JWE, or signed token semantics.
- Do not add a second visible format such as pretty JSON or an env block.
- Do not keep legacy `OWOX_API_ORIGIN`, `OWOX_API_KEY_ID`, or `OWOX_API_KEY_SECRET` setup paths.
- Do not change the raw HTTP Data API authentication contract.

## Backend

API key creation continues to generate `apiKeyId` and `apiKeySecret` internally.

After creation, the backend builds the one-time `apiKey` value using the authoritative API origin. This should use the application public origin configuration, not the Looker Studio destination-specific deployment URL.

Create response:

```json
{
  "apiKey": "owox_key_...",
  "apiKeyId": "pmk_xxx",
  "name": "My key",
  "createdAt": "2026-06-03T00:00:00.000Z",
  "expiresAt": null,
  "lastAuthenticatedAt": null
}
```

`apiKeySecret` is no longer returned as a separate response field.

List, update, revoke, and details responses can continue to include `apiKeyId` because it is useful for operations and support. They must never include `apiKeySecret` or the full `apiKey` after the creation response.

## Web UI

The creation dialog shows one primary field:

```text
API Key
owox_key_...
```

Actions:

- Copy API Key
- I have saved the API Key

The creation dialog does not show separate Origin, API Key ID, or API Key Secret fields.

Management screens may show API Key ID as a secondary identifier. API Key ID should not be required for setup, but it should remain available for debugging and support.

## owox-ctl

`owox-ctl` reads one environment variable:

```bash
export OWOX_API_KEY=owox_key_...
```

The CLI parses `OWOX_API_KEY`, extracts `apiOrigin`, `apiKeyId`, and `apiKeySecret`, and then uses the existing token exchange internally.

Legacy environment variables are removed from the supported configuration path:

- `OWOX_API_ORIGIN`
- `OWOX_API_KEY_ID`
- `OWOX_API_KEY_SECRET`

`owox-ctl status` reports safe operational metadata:

```json
{
  "apiOrigin": "https://app.owox.com",
  "apiKeyId": "pmk_xxx",
  "authenticated": true,
  "envFile": null
}
```

The CLI must never print `OWOX_API_KEY`, `apiKeySecret`, or the decoded payload.

## @owox/api-client

The client constructor accepts one credential:

```ts
const client = new OWOXApiClient({
  apiKey: process.env.OWOX_API_KEY!,
});
```

The client parses the API Key and internally exchanges credentials with the existing HTTP contract:

- Header: `X-OWOX-Api-Key-Id`
- Body: `{ "apiKeySecret": "..." }`

Separate constructor fields are removed:

- `apiOrigin`
- `apiKeyId`
- `apiKeySecret`

## HTTP Data API

The public HTTP authentication exchange contract stays unchanged.

The exchange endpoint continues to accept:

- `X-OWOX-Api-Key-Id`
- request body containing `apiKeySecret`

The combined API Key is a packaging format for official clients and CLI tooling, not a new HTTP authentication scheme.

## Validation

Parsing rejects:

- Missing `owox_key_` prefix.
- Empty encoded payload.
- Invalid base64url.
- Non-JSON decoded payload.
- Non-object JSON payload.
- Missing or empty `apiOrigin`.
- Missing or empty `apiKeyId`.
- Missing or empty `apiKeySecret`.
- Invalid `apiOrigin`.

Validation errors must not include the full API Key, decoded payload, or secret.

## Documentation

Docs should describe the new model as:

- Users receive one API Key.
- Store the full `owox_key_...` value securely.
- Use `OWOX_API_KEY` for `owox-ctl`.
- Use `{ apiKey: process.env.OWOX_API_KEY! }` for `@owox/api-client`.
- API Key ID is a non-secret identifier used in status output, logs, support, and debugging.

Docs should remove setup instructions that teach users to configure separate origin, key ID, and secret values.

## Testing

Backend tests should cover:

- Create response includes `apiKey`.
- Create response no longer includes `apiKeySecret`.
- Encoded API Key decodes to the expected origin, key ID, and secret.
- List/update/revoke responses do not include `apiKey` or `apiKeySecret`.

UI tests should cover:

- Creation dialog shows one API Key field.
- Copy action copies the exact `owox_key_...` value.
- Creation dialog does not render separate Origin, API Key ID, or API Key Secret fields.
- Management UI can still expose API Key ID as secondary metadata.

CLI tests should cover:

- `OWOX_API_KEY` resolves to auth config.
- Invalid API Key values fail with safe messages.
- `status` prints API origin and API Key ID, but never prints the full API Key or secret.
- Legacy env vars are not treated as sufficient configuration.

API client tests should cover:

- Constructor accepts `{ apiKey }`.
- Parsed credentials are exchanged using the existing header and body contract.
- Invalid API Key values fail before network requests.
- Constructor no longer accepts separate origin, key ID, and secret fields in the public type.
