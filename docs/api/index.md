# API

Use the OWOX Data Marts API to connect external tools, scripts, AI agents, and custom applications to your OWOX Data Marts project.

API access is an integration and automation layer on top of OWOX Data Marts concepts such as Data Marts, Storages, and Destinations. Use it when you need JSON terminal commands, scripted automation, TypeScript or JavaScript integrations, or direct HTTP API inspection.

## Choose an API access path

| Need | Use |
| --- | --- |
| Create credentials for external tools | [API Keys](./api-keys/) |
| Work from a terminal, CI job, or AI agent with JSON output | [owox-ctl](./owox-ctl/) |
| Build with TypeScript or JavaScript | [@owox/api-client](./api-client/) |
| Inspect the HTTP API contract | [OpenAPI and Swagger UI](./openapi/) |

## Access options

API Keys authenticate external tools and integrations without an interactive browser session. Create an API key before using other API access options.

[owox-ctl](./owox-ctl/) is the OWOX Data Marts Control CLI for terminal, CI, and AI agent usage. It reads credentials from environment variables or `--env-file` and emits JSON.

[@owox/api-client](./api-client/) is the TypeScript/JavaScript API Client for custom applications, scripts, and internal tools.

OpenAPI and Swagger UI help developers inspect the raw HTTP API endpoints, request schemas, and response schemas.
