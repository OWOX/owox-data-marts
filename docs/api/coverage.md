# API Coverage

This page tracks public HTTP API coverage by capability. Each row records whether the runtime route
has an explicit OpenAPI contract, a typed `@owox/api-client` abstraction, and executable contract
evidence. Capabilities are added as they are audited; absence from this page is unassessed, not an
approved exemption.

## Project settings

Coverage updated: 2026-07-21

| Method and path                          | Exposure                                                  | OpenAPI status                                                | API client status                      | Verification evidence                                                                                                  | Exemption approval |
| ---------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `GET /api/projects/settings`             | Authenticated public; Project Member (`viewer` or higher) | Covered: operation and `200` response schema                  | Covered: `project.getSettings()`       | Backend `project-settings.controller.openapi.spec.ts`; client `client.test.ts`                                         | Not applicable     |
| `PUT /api/projects/settings/description` | Authenticated public; Project Admin                       | Covered: operation, request schema, and `200` response schema | Covered: `project.updateDescription()` | Backend `project-settings.controller.openapi.spec.ts`; client `client.test.ts` (PUT body, auth retry, forbidden error) | Not applicable     |

Focused verification:

```sh
npm test -w @owox/backend -- --runInBand --runTestsByPath src/project-settings/controllers/project-settings.controller.openapi.spec.ts
npm test -w @owox/api-client -- --runInBand --runTestsByPath src/client.test.ts
```

## Project setup progress

Coverage updated: 2026-07-21

| Method and path                   | Exposure                                                  | OpenAPI status                               | API client status                     | Verification evidence                                                                                                            | Exemption approval |
| --------------------------------- | --------------------------------------------------------- | -------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `GET /api/project-setup-progress` | Authenticated public; Project Member (`viewer` or higher) | Covered: operation and `200` response schema | Covered: `project.getSetupProgress()` | Backend `project-setup-progress.controller.openapi.spec.ts`; client `project-setup-progress.test.ts` (auth, response validation) | Not applicable     |

Focused verification:

```sh
npm test -w @owox/backend -- --runInBand --runTestsByPath src/data-marts/controllers/project-setup-progress.controller.openapi.spec.ts
npm test -w @owox/api-client -- --runInBand --runTestsByPath src/project-setup-progress.test.ts
```

## Project run history

Coverage updated: 2026-07-21

| Method and path            | Exposure                                                  | OpenAPI status                                                     | API client status                  | Verification evidence                                                                                                                     | Exemption approval |
| -------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `GET /api/data-marts/runs` | Authenticated public; Project Member (`viewer` or higher) | Covered: operation, optional pagination, and `200` response schema | Covered: `project.getRunHistory()` | Backend `project-data-mart-runs.controller.openapi.spec.ts`; client `project-run-history.test.ts` (pagination, auth, response validation) | Not applicable     |

Focused verification:

```sh
npm test -w @owox/backend -- --runInBand --runTestsByPath src/data-marts/controllers/project-data-mart-runs.controller.openapi.spec.ts
npm test -w @owox/api-client -- --runInBand --runTestsByPath src/project-run-history.test.ts
```

## Models canvas

Coverage updated: 2026-07-21

| Method and path                    | Exposure                                                  | OpenAPI status                                                  | API client status                | Verification evidence                                                                                    | Exemption approval |
| ---------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------ |
| `GET /api/model-canvas/data-marts` | Authenticated public; Project Member (`viewer` or higher) | Covered: operation, query parameters, and `200` response schema | Covered: `models.getDataMarts()` | Backend `model-canvas.controller.openapi.spec.ts`; client `model-canvas.test.ts` (query, auth, response) | Not applicable     |
| `GET /api/model-canvas/edges`      | Authenticated public; Project Member (`viewer` or higher) | Covered: operation, required query, and `200` response schema   | Covered: `models.getEdges()`     | Backend `model-canvas.controller.openapi.spec.ts`; client `model-canvas.test.ts` (query, auth, response) | Not applicable     |

Focused verification:

```sh
npm test -w @owox/backend -- --runInBand --runTestsByPath src/data-marts/controllers/model-canvas.controller.openapi.spec.ts
npm test -w @owox/api-client -- --runInBand --runTestsByPath src/model-canvas.test.ts
```
