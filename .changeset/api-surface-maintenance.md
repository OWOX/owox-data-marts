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

`@owox/api-client` adds `insightTemplates.list({ limit, offset })` for authenticated,
project-wide discovery of reusable insight definitions across accessible Data Marts. It exports
`OWOXProjectInsightTemplatesResponse`, `OWOXProjectInsightTemplate`,
`OWOXProjectInsightTemplateDataMartRef`, `OWOXProjectInsightTemplateUser`, and
`OWOXProjectInsightTemplateListOptions`. Each result includes its Data Mart reference, creator
metadata when available, and the current member's `canDelete` state. Existing viewer access and
HTTP behavior are unchanged, and consumers can adopt the client method without a migration.
