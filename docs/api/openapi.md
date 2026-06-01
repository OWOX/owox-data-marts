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

## Compatibility

The same client and OWOX Data Marts server version is supported. Different versions are best effort.
