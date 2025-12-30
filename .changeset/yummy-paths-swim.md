---
'owox': minor
---

# Microsoft Ads: AccountID changes to AccountIDs

The Microsoft Ads connector configuration field has been renamed from `AccountID` to `AccountIDs` to better reflect its capability. You can now specify multiple Account IDs (comma-separated) in a single field, allowing you to load data for several accounts using one connector instead of creating separate connectors for each account.

Existing Microsoft Ads connectors will be automatically migrated with no action required on your part.
