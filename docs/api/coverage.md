# API Support Matrix

This page tracks externally supported OWOX Data Marts business endpoints that
accept authentication derived from an OWOX API key.

The inventory excludes endpoints that reject API-key authentication, internal
and legacy routes, authentication infrastructure such as
`POST /api/auth/api-keys/exchange`, MCP and OAuth protocol routes, and the
deprecated direct-link-only Insights family. Only the current Insights family
accessible through the regular UI is included.

`Covered · YYYY-MM-DD` records when a coverage dimension became complete.
`Gap` means required coverage is known to be missing. `Unassessed` means the
dimension has not been evaluated and does not imply a gap.

## Summary

| API-key endpoints | Fully covered | OpenAPI covered | API client covered | Unassessed |
| ----------------: | ------------: | ---------------: | -----------------: | ---------: |
|               154 |     6/154 (4%) |       6/154 (4%) |         6/154 (4%) |        148 |

Fully covered means both OpenAPI and API client coverage are complete. All
percentages use the complete endpoint inventory below as their denominator.

## Authentication

| Endpoint | OpenAPI | API client |
| --- | --- | --- |
| `GET /api/auth/context` | Unassessed | Unassessed |

## Connectors

| Endpoint | OpenAPI | API client |
| --- | --- | --- |
| `GET /api/connectors` | Unassessed | Unassessed |
| `GET /api/connectors/{connectorName}/fields` | Unassessed | Unassessed |
| `POST /api/connectors/{connectorName}/oauth/exchange` | Unassessed | Unassessed |
| `GET /api/connectors/{connectorName}/oauth/settings` | Unassessed | Unassessed |
| `GET /api/connectors/{connectorName}/oauth/status/{credentialId}` | Unassessed | Unassessed |
| `GET /api/connectors/{connectorName}/specification` | Unassessed | Unassessed |

## Contexts

| Endpoint | OpenAPI | API client |
| --- | --- | --- |
| `GET /api/contexts` | Unassessed | Unassessed |
| `POST /api/contexts` | Unassessed | Unassessed |
| `DELETE /api/contexts/{id}` | Unassessed | Unassessed |
| `PUT /api/contexts/{id}` | Unassessed | Unassessed |
| `GET /api/contexts/{id}/impact` | Unassessed | Unassessed |
| `PUT /api/contexts/{id}/members` | Unassessed | Unassessed |

## Data Mart Relationships

| Endpoint | OpenAPI | API client |
| --- | --- | --- |
| `POST /api/data-marts/{dataMartId}/relationships` | Unassessed | Unassessed |
| `GET /api/data-marts/{dataMartId}/relationships/graph` | Unassessed | Unassessed |
| `DELETE /api/data-marts/{dataMartId}/relationships/{id}` | Unassessed | Unassessed |
| `PATCH /api/data-marts/{dataMartId}/relationships/{id}` | Unassessed | Unassessed |

## Data Storage Relationships

| Endpoint | OpenAPI | API client |
| --- | --- | --- |
| `GET /api/data-storages/{storageId}/relationships` | Unassessed | Unassessed |

## Data destinations

| Endpoint | OpenAPI | API client |
| --- | --- | --- |
| `GET /api/data-destinations` | Unassessed | Unassessed |
| `POST /api/data-destinations` | Unassessed | Unassessed |
| `GET /api/data-destinations/by-type/{type}` | Unassessed | Unassessed |
| `POST /api/data-destinations/connect/google-sheets` | Unassessed | Unassessed |
| `POST /api/data-destinations/oauth/authorize` | Unassessed | Unassessed |
| `GET /api/data-destinations/oauth/credential-status/{credentialId}` | Unassessed | Unassessed |
| `POST /api/data-destinations/oauth/exchange` | Unassessed | Unassessed |
| `GET /api/data-destinations/oauth/settings` | Unassessed | Unassessed |
| `DELETE /api/data-destinations/{id}` | Unassessed | Unassessed |
| `GET /api/data-destinations/{id}` | Unassessed | Unassessed |
| `PUT /api/data-destinations/{id}` | Unassessed | Unassessed |
| `PUT /api/data-destinations/{id}/availability` | Unassessed | Unassessed |
| `POST /api/data-destinations/{id}/google-sheets/documents` | Unassessed | Unassessed |
| `GET /api/data-destinations/{id}/impact` | Unassessed | Unassessed |
| `DELETE /api/data-destinations/{id}/oauth` | Unassessed | Unassessed |
| `POST /api/data-destinations/{id}/oauth/authorize` | Unassessed | Unassessed |
| `GET /api/data-destinations/{id}/oauth/status` | Unassessed | Unassessed |
| `POST /api/data-destinations/{id}/rotate-secret-key` | Unassessed | Unassessed |

## Data Marts

| Endpoint | OpenAPI | API client |
| --- | --- | --- |
| `GET /api/data-marts` | Unassessed | Unassessed |
| `POST /api/data-marts` | Unassessed | Unassessed |
| `GET /api/data-marts/ai-helper/availability` | Unassessed | Unassessed |
| `GET /api/data-marts/by-connector/{connectorName}` | Unassessed | Unassessed |
| `POST /api/data-marts/health-status` | Unassessed | Unassessed |
| `GET /api/data-marts/member-ownership-warnings` | Unassessed | Unassessed |
| `POST /api/data-marts/{dataMartId}/ai-helper/triggers` | Unassessed | Unassessed |
| `DELETE /api/data-marts/{dataMartId}/ai-helper/triggers/{triggerId}` | Unassessed | Unassessed |
| `GET /api/data-marts/{dataMartId}/ai-helper/triggers/{triggerId}` | Unassessed | Unassessed |
| `GET /api/data-marts/{dataMartId}/ai-helper/triggers/{triggerId}/status` | Unassessed | Unassessed |
| `POST /api/data-marts/{dataMartId}/schema-actualize-triggers` | Unassessed | Unassessed |
| `DELETE /api/data-marts/{dataMartId}/schema-actualize-triggers/{triggerId}` | Unassessed | Unassessed |
| `GET /api/data-marts/{dataMartId}/schema-actualize-triggers/{triggerId}` | Unassessed | Unassessed |
| `GET /api/data-marts/{dataMartId}/schema-actualize-triggers/{triggerId}/status` | Unassessed | Unassessed |
| `POST /api/data-marts/{dataMartId}/sql-dry-run-triggers` | Unassessed | Unassessed |
| `DELETE /api/data-marts/{dataMartId}/sql-dry-run-triggers/{triggerId}` | Unassessed | Unassessed |
| `GET /api/data-marts/{dataMartId}/sql-dry-run-triggers/{triggerId}` | Unassessed | Unassessed |
| `GET /api/data-marts/{dataMartId}/sql-dry-run-triggers/{triggerId}/status` | Unassessed | Unassessed |
| `DELETE /api/data-marts/{id}` | Unassessed | Unassessed |
| `GET /api/data-marts/{id}` | Unassessed | Unassessed |
| `PUT /api/data-marts/{id}/availability` | Unassessed | Unassessed |
| `GET /api/data-marts/{id}/blendable-schema` | Unassessed | Unassessed |
| `PUT /api/data-marts/{id}/blended-fields-config` | Unassessed | Unassessed |
| `PUT /api/data-marts/{id}/contexts` | Unassessed | Unassessed |
| `PUT /api/data-marts/{id}/definition` | Unassessed | Unassessed |
| `PUT /api/data-marts/{id}/description` | Unassessed | Unassessed |
| `POST /api/data-marts/{id}/manual-run` | Unassessed | Unassessed |
| `PUT /api/data-marts/{id}/owners` | Unassessed | Unassessed |
| `PUT /api/data-marts/{id}/publish` | Unassessed | Unassessed |
| `GET /api/data-marts/{id}/runs` | Unassessed | Unassessed |
| `GET /api/data-marts/{id}/runs/{runId}` | Unassessed | Unassessed |
| `POST /api/data-marts/{id}/runs/{runId}/cancel` | Unassessed | Unassessed |
| `PUT /api/data-marts/{id}/schema` | Unassessed | Unassessed |
| `PUT /api/data-marts/{id}/title` | Unassessed | Unassessed |
| `POST /api/data-marts/{id}/validate-definition` | Unassessed | Unassessed |

## Data storages

| Endpoint | OpenAPI | API client |
| --- | --- | --- |
| `GET /api/data-storages` | Unassessed | Unassessed |
| `POST /api/data-storages` | Unassessed | Unassessed |
| `GET /api/data-storages/by-type/{type}` | Unassessed | Unassessed |
| `POST /api/data-storages/oauth/exchange` | Unassessed | Unassessed |
| `GET /api/data-storages/oauth/settings` | Unassessed | Unassessed |
| `POST /api/data-storages/{dataStorageId}/publish-drafts-triggers` | Unassessed | Unassessed |
| `DELETE /api/data-storages/{dataStorageId}/publish-drafts-triggers/{triggerId}` | Unassessed | Unassessed |
| `GET /api/data-storages/{dataStorageId}/publish-drafts-triggers/{triggerId}` | Unassessed | Unassessed |
| `GET /api/data-storages/{dataStorageId}/publish-drafts-triggers/{triggerId}/status` | Unassessed | Unassessed |
| `DELETE /api/data-storages/{id}` | Unassessed | Unassessed |
| `GET /api/data-storages/{id}` | Unassessed | Unassessed |
| `PUT /api/data-storages/{id}` | Unassessed | Unassessed |
| `PUT /api/data-storages/{id}/availability` | Unassessed | Unassessed |
| `DELETE /api/data-storages/{id}/oauth` | Unassessed | Unassessed |
| `POST /api/data-storages/{id}/oauth/authorize` | Unassessed | Unassessed |
| `GET /api/data-storages/{id}/oauth/status` | Unassessed | Unassessed |
| `GET /api/data-storages/{id}/resources` | Unassessed | Unassessed |
| `POST /api/data-storages/{id}/validate-access` | Unassessed | Unassessed |

## HTTP Data

| Endpoint | OpenAPI | API client |
| --- | --- | --- |
| `GET /api/external/http-data/data-marts/{dataMartId}.ndjson` | Unassessed | Unassessed |

## Insights

This section includes only the current Insights family. The deprecated family
whose UI is reachable only through direct links is excluded.

| Endpoint | OpenAPI | API client |
| --- | --- | --- |
| `GET /api/data-marts/insight-templates` | Unassessed | Unassessed |
| `GET /api/data-marts/{dataMartId}/ai-assistant/run-triggers` | Unassessed | Unassessed |
| `DELETE /api/data-marts/{dataMartId}/ai-assistant/run-triggers/{triggerId}` | Unassessed | Unassessed |
| `GET /api/data-marts/{dataMartId}/ai-assistant/run-triggers/{triggerId}` | Unassessed | Unassessed |
| `GET /api/data-marts/{dataMartId}/ai-assistant/run-triggers/{triggerId}/status` | Unassessed | Unassessed |
| `GET /api/data-marts/{dataMartId}/ai-assistant/sessions` | Unassessed | Unassessed |
| `POST /api/data-marts/{dataMartId}/ai-assistant/sessions` | Unassessed | Unassessed |
| `DELETE /api/data-marts/{dataMartId}/ai-assistant/sessions/{sessionId}` | Unassessed | Unassessed |
| `GET /api/data-marts/{dataMartId}/ai-assistant/sessions/{sessionId}` | Unassessed | Unassessed |
| `POST /api/data-marts/{dataMartId}/ai-assistant/sessions/{sessionId}/apply` | Unassessed | Unassessed |
| `POST /api/data-marts/{dataMartId}/ai-assistant/sessions/{sessionId}/messages` | Unassessed | Unassessed |
| `PATCH /api/data-marts/{dataMartId}/ai-assistant/sessions/{sessionId}/title` | Unassessed | Unassessed |
| `GET /api/data-marts/{dataMartId}/insight-artifacts` | Unassessed | Unassessed |
| `POST /api/data-marts/{dataMartId}/insight-artifacts` | Unassessed | Unassessed |
| `DELETE /api/data-marts/{dataMartId}/insight-artifacts/{insightArtifactId}` | Unassessed | Unassessed |
| `GET /api/data-marts/{dataMartId}/insight-artifacts/{insightArtifactId}` | Unassessed | Unassessed |
| `PUT /api/data-marts/{dataMartId}/insight-artifacts/{insightArtifactId}` | Unassessed | Unassessed |
| `POST /api/data-marts/{dataMartId}/insight-artifacts/{insightArtifactId}/sql-preview-triggers` | Unassessed | Unassessed |
| `DELETE /api/data-marts/{dataMartId}/insight-artifacts/{insightArtifactId}/sql-preview-triggers/{triggerId}` | Unassessed | Unassessed |
| `GET /api/data-marts/{dataMartId}/insight-artifacts/{insightArtifactId}/sql-preview-triggers/{triggerId}` | Unassessed | Unassessed |
| `GET /api/data-marts/{dataMartId}/insight-artifacts/{insightArtifactId}/sql-preview-triggers/{triggerId}/status` | Unassessed | Unassessed |
| `PUT /api/data-marts/{dataMartId}/insight-artifacts/{insightArtifactId}/title` | Unassessed | Unassessed |
| `GET /api/data-marts/{dataMartId}/insight-templates` | Unassessed | Unassessed |
| `POST /api/data-marts/{dataMartId}/insight-templates` | Unassessed | Unassessed |
| `DELETE /api/data-marts/{dataMartId}/insight-templates/{insightTemplateId}` | Unassessed | Unassessed |
| `GET /api/data-marts/{dataMartId}/insight-templates/{insightTemplateId}` | Unassessed | Unassessed |
| `PUT /api/data-marts/{dataMartId}/insight-templates/{insightTemplateId}` | Unassessed | Unassessed |
| `GET /api/data-marts/{dataMartId}/insight-templates/{insightTemplateId}/run-triggers` | Unassessed | Unassessed |
| `POST /api/data-marts/{dataMartId}/insight-templates/{insightTemplateId}/run-triggers` | Unassessed | Unassessed |
| `DELETE /api/data-marts/{dataMartId}/insight-templates/{insightTemplateId}/run-triggers/{triggerId}` | Unassessed | Unassessed |
| `GET /api/data-marts/{dataMartId}/insight-templates/{insightTemplateId}/run-triggers/{triggerId}` | Unassessed | Unassessed |
| `GET /api/data-marts/{dataMartId}/insight-templates/{insightTemplateId}/run-triggers/{triggerId}/status` | Unassessed | Unassessed |
| `GET /api/data-marts/{dataMartId}/insight-templates/{insightTemplateId}/sources` | Unassessed | Unassessed |
| `POST /api/data-marts/{dataMartId}/insight-templates/{insightTemplateId}/sources` | Unassessed | Unassessed |
| `DELETE /api/data-marts/{dataMartId}/insight-templates/{insightTemplateId}/sources/{sourceId}` | Unassessed | Unassessed |
| `PATCH /api/data-marts/{dataMartId}/insight-templates/{insightTemplateId}/sources/{sourceId}` | Unassessed | Unassessed |
| `PUT /api/data-marts/{dataMartId}/insight-templates/{insightTemplateId}/title` | Unassessed | Unassessed |

## Model Canvas

| Endpoint | OpenAPI | API client |
| --- | --- | --- |
| `GET /api/model-canvas/data-marts` | Covered · 2026-07-21 | Covered · 2026-07-21 |
| `GET /api/model-canvas/edges` | Covered · 2026-07-21 | Covered · 2026-07-21 |

## Project notification settings

| Endpoint | OpenAPI | API client |
| --- | --- | --- |
| `GET /api/projects/notification-settings` | Unassessed | Unassessed |
| `GET /api/projects/notification-settings/members` | Unassessed | Unassessed |
| `PUT /api/projects/notification-settings/{notificationType}` | Unassessed | Unassessed |
| `POST /api/projects/notification-settings/{notificationType}/test-webhook` | Unassessed | Unassessed |

## Project settings

| Endpoint | OpenAPI | API client |
| --- | --- | --- |
| `GET /api/projects/settings` | Covered · 2026-07-21 | Covered · 2026-07-21 |
| `PUT /api/projects/settings/description` | Covered · 2026-07-21 | Covered · 2026-07-21 |

## Reports

| Endpoint | OpenAPI | API client |
| --- | --- | --- |
| `GET /api/reports` | Unassessed | Unassessed |
| `POST /api/reports` | Unassessed | Unassessed |
| `GET /api/reports/data-mart/{dataMartId}` | Unassessed | Unassessed |
| `GET /api/reports/data-mart/{dataMartId}/insight-template/{insightTemplateId}` | Unassessed | Unassessed |
| `DELETE /api/reports/{id}` | Unassessed | Unassessed |
| `GET /api/reports/{id}` | Unassessed | Unassessed |
| `PUT /api/reports/{id}` | Unassessed | Unassessed |
| `POST /api/reports/{id}/copy-as-data-mart` | Unassessed | Unassessed |
| `GET /api/reports/{id}/generated-sql` | Unassessed | Unassessed |
| `POST /api/reports/{id}/run` | Unassessed | Unassessed |

## Run History

| Endpoint | OpenAPI | API client |
| --- | --- | --- |
| `GET /api/data-marts/runs` | Covered · 2026-07-21 | Covered · 2026-07-21 |

## Scheduled triggers

| Endpoint | OpenAPI | API client |
| --- | --- | --- |
| `GET /api/data-marts/scheduled-triggers` | Unassessed | Unassessed |
| `GET /api/data-marts/{dataMartId}/scheduled-triggers` | Unassessed | Unassessed |
| `POST /api/data-marts/{dataMartId}/scheduled-triggers` | Unassessed | Unassessed |
| `DELETE /api/data-marts/{dataMartId}/scheduled-triggers/{id}` | Unassessed | Unassessed |
| `GET /api/data-marts/{dataMartId}/scheduled-triggers/{id}` | Unassessed | Unassessed |
| `PUT /api/data-marts/{dataMartId}/scheduled-triggers/{id}` | Unassessed | Unassessed |

## Search

| Endpoint | OpenAPI | API client |
| --- | --- | --- |
| `GET /api/search` | Unassessed | Unassessed |

## Project setup progress

| Endpoint | OpenAPI | API client |
| --- | --- | --- |
| `GET /api/project-setup-progress` | Covered · 2026-07-21 | Covered · 2026-07-21 |
