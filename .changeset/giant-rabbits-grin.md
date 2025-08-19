---
'owox': minor
---

# Update API version and refactor insights data fetching logic

- Updated the Facebook Graph API base URL to use version 23.0 directly in the code, removing the configurable ApiBaseUrl parameter.
- Refactored the insights data fetching logic to pass the API base URL explicitly to helper methods.
- Modified _fetchInsightsData and_buildInsightsUrl to accept and use the API base URL as a parameter.
- Removed the unsupported activity_recency field from adAccountInsightsFields.
- Improved code clarity and maintainability by simplifying how the API URL is constructed and used throughout the Facebook Marketing source integration.
