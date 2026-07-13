---
'owox': minor
---

# Shared Login Customer ID field for Google Ads

The **Login Customer ID** for Google Ads is now a single top-level field shared across all authentication types instead of a separate field nested inside each auth type. Previously the value could be lost when switching between authentication methods and was not reachable from the OAuth button flow. Existing connectors keep working — the old stored value is still read as a fallback. The field is now optional for Service Account authentication and, in the configuration form, appears directly under Customer ID.
