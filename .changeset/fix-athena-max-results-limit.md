---
'owox': minor
---

# Fix Athena MaxResults exceeding API limit of 1000

Cap `MaxResults` parameter to 1000 in Athena `getQueryResults` to comply with the AWS Athena API limit. Previously, callers could pass values greater than 1000 (e.g., streaming batch size of 5000), causing `InvalidRequestException` errors.
