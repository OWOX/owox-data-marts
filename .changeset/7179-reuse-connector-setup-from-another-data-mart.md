---
'owox': minor
---

**Set up a connector Data Mart from another one again, with its Credential and account**

Since connector keys moved to Credentials, a new connector Data Mart could take only the Credential: account IDs and the other settings had to be looked up in an existing Data Mart and entered by hand. **Reuse from another Data Mart** is back in the connector settings. Pick a Data Mart with the same source, and the new configuration uses the same Credential and gets the same settings, such as account IDs. No key is copied: both Data Marts use one Credential, so replacing its values updates both.

- If the selected Data Mart's Credential is not available to you, only the settings are copied, and you select a Credential yourself.
- The list shows only Data Marts you can open.

See [Add access Credentials](../../docs/getting-started/setup-guide/connector-data-mart.md#step-3-add-access-credentials).

<!-- markdownlint-disable-file MD041 MD036 -->
