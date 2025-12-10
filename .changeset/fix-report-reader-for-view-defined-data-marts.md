---
owox: minor
---

# Fix Report Reader for View-Defined Data Marts in BigQuery Storage

Fixed report reader functionality for data marts defined by views in BigQuery Storage.

- Enhanced definition type checking in BigQuery Storage report reader to properly distinguish between definition types.
- Added explicit `definitionType` parameter validation to ensure correct handling of view-based data mart definitions in BigQuery Storage.
