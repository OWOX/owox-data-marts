# OpenAPI and Swagger UI

OWOX Data Marts exposes OpenAPI specifications and Swagger UI for the HTTP API.

For OWOX Data Marts Cloud at [https://app.owox.com](https://app.owox.com), API documentation is available at:

- [https://app.owox.com/api/openapi.json](https://app.owox.com/api/openapi.json)
- [https://app.owox.com/api/openapi.yaml](https://app.owox.com/api/openapi.yaml)
- [https://app.owox.com/api/swagger-ui](https://app.owox.com/api/swagger-ui)

For a self-managed OWOX Data Marts deployment at `https://your-owox.example.com`, use:

- `https://your-owox.example.com/api/openapi.json`
- `https://your-owox.example.com/api/openapi.yaml`
- `https://your-owox.example.com/api/swagger-ui`

Use OpenAPI and Swagger UI to inspect available endpoints, request schemas, and response schemas.

## Relationship to other API tools

- Use [owox-ctl](./owox-ctl/) when you want JSON terminal commands for automation or AI agents.
- Use [@owox/api-client](./api-client/) when you build TypeScript or JavaScript integrations.
- Use OpenAPI and Swagger UI when you need to inspect or integrate with the raw HTTP API directly.

Authenticated API requests require API key-based authentication. Start with [API Keys](./api-keys/) before calling protected endpoints.

## Raw HTTP API contract

Raw HTTP API requests do not send the copied `owox_key_...` value directly. `owox-ctl` and
`@owox/api-client` parse that value and perform the token exchange automatically.

If you integrate with the HTTP API directly, parse the copied API key value first:

1. Remove the `owox_key_` prefix.
2. Base64url-decode the remaining value.
3. Parse the decoded JSON object.
4. Read `apiOrigin`, `apiKeyId`, and `apiKeySecret`.

Exchange the API Key ID and API Key Secret for an access token:

```http
POST /api/auth/api-keys/exchange
Content-Type: application/json
X-OWOX-Api-Key-Id: <apiKeyId>

{
  "apiKeySecret": "<apiKeySecret>"
}
```

Send this request to the decoded `apiOrigin`, for example
`https://app.owox.com/api/auth/api-keys/exchange`.

The response contains an access token:

```json
{
  "accessToken": "<accessToken>"
}
```

Use that access token when calling protected endpoints:

```http
GET /api/external/http-data/data-marts/<dataMartId>.ndjson
x-owox-authorization: Bearer <accessToken>
X-OWOX-Api-Key-Id: <apiKeyId>
```

Keep `X-OWOX-Api-Key-Id` on protected requests that use an access token created from an API
key. The server binds API-key access tokens to their API Key ID.

## Compatibility

The same client and OWOX Data Marts server version is supported. Different versions are best effort.
