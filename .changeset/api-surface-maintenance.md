---
'owox': minor
---

# API surface maintenance

## Add project settings API contracts and client support

The project settings endpoints now publish explicit OpenAPI request and response contracts.
`@owox/api-client` adds `project.getSettings()` and `project.updateDescription()` with the
same authenticated retry and error behavior as existing client requests. API usage and coverage are
documented for both routes.

## Add Models canvas API client support

`@owox/api-client` now exposes paginated Models canvas data marts through
`models.getDataMarts()` and their visible relationship edges through `models.getEdges()`.
Focused backend OpenAPI evidence, client usage, and API coverage are documented for both routes.
