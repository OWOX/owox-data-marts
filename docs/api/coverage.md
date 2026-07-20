# API Coverage

This page tracks public HTTP API coverage by capability. Each row records whether the runtime route
has an explicit OpenAPI contract, a typed `@owox/api-client` abstraction, and executable contract
evidence. Capabilities are added as they are audited; absence from this page is unassessed, not an
approved exemption.

## Project settings

| Method and path | Exposure | OpenAPI status | API client status | Verification evidence | Exemption approval |
| --- | --- | --- | --- | --- | --- |
| `GET /api/projects/settings` | Authenticated public; Project Member (`viewer` or higher) | Covered: operation and `200` response schema | Covered: `project.getSettings()` | Backend `project-settings.controller.openapi.spec.ts`; client `client.test.ts` | Not applicable |
| `PUT /api/projects/settings/description` | Authenticated public; Project Admin | Covered: operation, request schema, and `200` response schema | Covered: `project.updateDescription()` | Backend `project-settings.controller.openapi.spec.ts`; client `client.test.ts` (PUT body, auth retry, forbidden error) | Not applicable |

Focused verification:

```sh
npm test -w @owox/backend -- --runInBand --runTestsByPath src/project-settings/controllers/project-settings.controller.openapi.spec.ts
npm test -w @owox/api-client -- --runInBand --runTestsByPath src/client.test.ts
```
