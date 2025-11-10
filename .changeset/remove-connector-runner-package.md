---
owox: minor
---

# Refactor connector execution architecture by removing the standalone `@owox/connector-runner` package and integrating its functionality directly into `@owox/connectors` package

**Breaking changes:**

- Removed `@owox/connector-runner` package entirely
- Moved connector execution logic to `@owox/connectors/src/connector-runner.js`
- Migrated DTOs to `@owox/connectors/src/Core/Dto/`

**Improvements:**

- Simplified dependency management by consolidating connector-related packages
- Updated connector execution service to use new DTOs and exports from connectors package
- Removed redundant GitHub workflows for connector-runner
- Cleaned up repository structure
