---
'owox': minor
---

# Remove `@kaciras/deasync` and `sync-request` dependencies and migrate to async/await

This is a minor breaking change that removes the `@kaciras/deasync` and `sync-request` dependencies from connectors package and migrates all synchronous blocking code to modern async/await patterns.

**Changes:**

- Removed `@kaciras/deasync` dependency
- Removed `sync-request` dependency
- Removed Google Apps Script support - Only Node.js environment is now supported
- Refactored `EnvironmentAdapter` into specialized utility classes:
  - `HttpUtils` - HTTP requests
  - `DateUtils` - Date formatting
  - `AsyncUtils` - Async delays
  - `CryptoUtils` - Cryptographic operations
  - `FileUtils` - File parsing and decompression
- Removed `ENVIRONMENT` enum and environment detection logic
- Updated connector documentation
