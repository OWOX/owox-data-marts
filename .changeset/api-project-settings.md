---
'owox': minor
---

# Add project settings API contracts and client support

The project settings endpoints now publish explicit OpenAPI request and response contracts.
`@owox/api-client` adds `projectSettings.get()` and `projectSettings.updateDescription()` with the
same authenticated retry and error behavior as existing client requests. API usage and coverage are
documented for both routes.
