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

`@owox/api-client` adds `runs.getHistory({ limit, offset })` for authenticated,
project-wide Data Mart execution monitoring. It exports `OWOXProjectDataMartRunsResponse`,
`OWOXProjectDataMartRun`, `OWOXProjectDataMartRunRef`, `OWOXProjectDataMartRunUser`,
`OWOXProjectDataMartRunStatus`, `OWOXProjectDataMartRunType`,
`OWOXProjectDataMartRunTriggerType`, and `OWOXProjectRunHistoryOptions`. Existing viewer access
and HTTP behavior are unchanged, and consumers can adopt the client method without a migration.

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

OAuth-flow-only connector, Data Destination, and Data Storage operations now reject
API-key-derived authentication. This includes connector OAuth settings, exchange, and status;
Data Destination OAuth settings, credential status, authorization, exchange, status, and
revocation; Google Sheets connection completion at
`POST /api/data-destinations/connect/google-sheets`; and Data Storage OAuth settings, exchange,
authorization, status, and revocation. Consumers using API keys for these routes must migrate the
flow to an interactively authenticated user session; API keys remain available for independently
useful non-OAuth resource operations.
