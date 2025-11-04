---
'owox': minor
---

# Remove `@kaciras/deasync` and `sync-request` dependencies and migrate to async/await

This is a minor breaking change that removes the `@kaciras/deasync` and `sync-request` dependencies from connectors package and migrates all synchronous blocking code to modern async/await patterns.

**Changes:**

- Removed `@kaciras/deasync` dependency
- Removed `sync-request` dependency
- Environment detection simplified - Only NODE environment is now supported
