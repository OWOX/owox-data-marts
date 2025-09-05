---
'owox': minor
---

# Add configurable timeout middleware for long-running operations

- Increase server timeout from 2 minutes to 3 minutes (180s) to prevent timeout errors
- Add operation-specific timeout middleware for data mart operations:
  - SQL editing operations: 3 minutes timeout
  - Schema operations: 3 minutes timeout  
  - Publishing operations: 3 minutes timeout
  - All other operations: 30 seconds timeout (default)
- Update frontend timeout configuration for specific operations to 3 minutes
- Prevent race conditions in timeout middleware by ensuring only one timeout per request
- Add proper cleanup and error handling in timeout middleware

This change fixes timeout issues for long-running operations like SQL editing, schema refresh, and data mart publishing while maintaining reasonable timeouts for other operations.
