---
'owox': minor
---

# Security: scope project notification settings API to the authenticated project

Project notification settings endpoints are now scoped strictly to the project of the authenticated user.
The previous routes (`projects/:projectId/notification-settings*`) trusted a caller-controlled URL segment for
tenant access, while role checks were performed against the token's own project — this allowed an authenticated
user from one project to read or modify another project's notification configuration.
