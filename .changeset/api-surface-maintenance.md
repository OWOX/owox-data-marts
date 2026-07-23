---
'owox': minor
---

# API surface maintenance

## Add project settings API contracts and client support

The project settings endpoints now publish explicit OpenAPI request and response contracts.
`@owox/api-client` adds `project.getSettings()` and `project.updateDescription()` with the
same authenticated retry and error behavior as existing client requests.

## Add Models canvas API client support

`@owox/api-client` now exposes paginated Models canvas data marts through
`models.getDataMarts()` and their visible relationship edges through `models.getEdges()`.

## Add project setup progress API contract and client support

`GET /api/project-setup-progress` now publishes an explicit OpenAPI response contract.
`@owox/api-client` adds `project.getSetupProgress()` and exports
`OWOXProjectSetupProgress`, `OWOXProjectSetupProgressSteps`, and
`OWOXProjectSetupStepState` for inspecting versioned, member-aware setup state. Existing
authenticated viewer access is unchanged, and consumers can adopt the client method without a
migration.

## Add project run history API client support

`@owox/api-client` adds `runs.list({ limit, offset })` for authenticated,
project-wide Data Mart execution monitoring. It exports `OWOXProjectDataMartRunsResponse`,
`OWOXProjectDataMartRun`, `OWOXProjectDataMartRunRef`, `OWOXProjectDataMartRunUser`,
`OWOXProjectDataMartRunStatus`, `OWOXProjectDataMartRunType`,
`OWOXProjectDataMartRunTriggerType`, and `OWOXProjectRunHistoryOptions`. The response contract
identifies `createdByUser` as the nullable run author and defines its `userId`, `fullName`, `email`,
and `avatar` fields. Run fields that are always emitted are required in the schema and client
types, while their runtime nullability remains explicit; `definitionRun` stays present but can be
null when a historical definition snapshot is unavailable. Pagination normalization and RFC3339
timestamp formats are documented, and the client rejects malformed or impossible timestamps.
Existing viewer access and HTTP behavior are unchanged, and consumers can adopt the client method
without a migration.

## Add project insight-template discovery API client support

`@owox/api-client` adds `insights.getTemplates({ limit, offset })` for authenticated,
project-wide discovery of reusable insight definitions across accessible Data Marts. It exports
`OWOXProjectInsightTemplatesResponse`, `OWOXProjectInsightTemplate`,
`OWOXProjectInsightTemplateDataMartRef`, `OWOXProjectInsightTemplateUser`, and
`OWOXProjectInsightTemplateListOptions`. Each result includes its Data Mart reference, creator
metadata when available, and the current member's `canDelete` state. Existing viewer access and
HTTP behavior are unchanged, and consumers can adopt the client method without a migration.

## Add Markdown rendering API contract and client support

`POST /api/markdown/parse-to-html` now publishes an explicit OpenAPI contract for its Markdown
request and raw HTML response. `@owox/api-client` adds
`markdown.parseToHtml({ markdown })` and exports `OWOXMarkdownParseRequest` and
`OWOXMarkdownParseResponse` for rendering with the same pipeline as the OWOX Data Marts web
interface. Existing viewer access and HTTP behavior are unchanged, and consumers can adopt the
client method without a migration.

## Add auth context introspection

`GET /api/auth/context` now publishes an explicit OpenAPI response contract for the current
API-key-derived project and member context. `@owox/api-client` exposes `auth.getContext()` and
`OWOXAuthContext` for validating a configured API key and reading that context without exposing
the API key secret. Existing authentication and authorization behavior are unchanged, and
consumers can adopt the client method without a migration.

## Require interactive authentication for OAuth flows

OAuth routes under `/api/connectors/{connectorName}/oauth`, `/api/data-destinations/oauth`,
`/api/data-destinations/{id}/oauth`, `/api/data-storages/oauth`, and
`/api/data-storages/{id}/oauth`, plus `POST /api/data-destinations/connect/google-sheets`, now
reject API-key authentication and require an interactive user session. API-key access to non-OAuth
resource operations is unchanged.

## Publish canonical API-key authentication headers

Protected OpenAPI operations now declare `X-OWOX-Authorization` and, only when API-key-derived
tokens are accepted, the optional `X-OWOX-Api-Key-Id` header that must match the token's API key
ID. Routes that reject API-key authentication omit that conditional header, while
`POST /api/auth/api-keys/exchange` retains its required API key ID input. Runtime authentication
behavior is unchanged; generated clients and API tooling can use the shared header contract
without endpoint-specific metadata.
