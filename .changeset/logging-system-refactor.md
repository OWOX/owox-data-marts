---
'owox': minor
---

# Logging System Architecture Refactor

- **Refactored logging architecture**: Extracted Pino logger creation from LoggerFactory into a provider-agnostic architecture while maintaining backward compatibility
- **Simplified configuration**: Removed `environment` presets from LoggerConfig, now only `LogLevel` controls logging behavior
- **Environment variables update**:
  - Changed from `LOG_LEVELS` (comma-separated) to `LOG_LEVEL` (threshold-based)
  - Updated `.env.example` with clear documentation
- **Enhanced TypeORM integration**: Improved `CustomDataSourceLogger` with proper parameter usage and context formatting

**Breaking Changes:**

- `LOG_LEVELS` environment variable renamed to `LOG_LEVEL`
- Removed `environment` field from `LoggerConfig` interface

**Migration:**

- Replace `LOG_LEVELS=log,warn,error` with `LOG_LEVEL=warn` (threshold-based) or app will use default `warn` level
- Remove `environment` parameter from LoggerFactory calls
