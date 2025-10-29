---
'owox': minor
---

# Add ability to copy connector configuration from existing Data Marts

Added a new feature that allows users to copy connector configuration settings from existing Data Marts when creating or editing connector-based Data Marts.

- **Copy configuration button**: New dropdown menu in the connector configuration step that shows all Data Marts with the same connector type
- **Multi-configuration support**: For Data Marts with multiple configurations, a nested menu allows selecting specific configuration
- **Configuration preview**: Tooltip on each item shows required fields with masked secrets
- **Secure secret copying**: Secrets are properly masked and merged from source on backend
