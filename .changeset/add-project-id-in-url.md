---
"owox": minor
---

Add project ID in URL routing

- Update routing structure to support project-based navigation
- Add project-scoped routing with `/ui/:projectId` URL structure
- Extract hardcoded `/ui` prefix to configurable `VITE_APP_PATH_PREFIX` environment variable
- Update all navigation links to use project-scoped routes
- Add proper route parameters validation in DataMartDetailsPage