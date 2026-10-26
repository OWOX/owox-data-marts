---
'owox': minor
---

<!-- markdownlint-disable-file MD041 MD036 -->

**Storages use reusable Credentials instead of their own keys**

**Existing Storages are converted once, on the first start of this version (or when you run migrations), and keep running; no action is needed.** Every owner of a Storage owns its Credential, Business Users included: they can edit, share and delete the Credential, but still cannot run or edit the Storage. Converted Credentials are Not shared, whatever the Storage's sharing: members who run or maintain a Storage without owning it keep doing so, but reuse its key elsewhere only after an owner shares the Credential. Identical keys of Storages with the same owners become one Credential, which keeps only the Contexts all its Storages shared. A Storage whose key cannot be converted keeps running on its own key until you select a Credential.

The Storage form now has a **Credential** field in place of the authentication method and key fields: select a Credential that fits the Storage type, or click **+ Create new Credential** to add one beside the form and select it on save. With exactly one fitting Credential, a new Storage selects it for you. The **Credentials** page gains Storage providers (BigQuery Service Account, BigQuery Google account, AWS access key, Snowflake password, Snowflake key pair, Databricks token), lists the Storages each Credential is used by, and does not delete a Credential that a Storage uses. Replacing a Credential's secret updates every Storage that uses it, as the video shows.

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/888fb6c28ce0e445d05e112676070a39/iframe>

**Copy credentials from another storage** is removed: select the same Credential in both Storages. `PUT /data-storages/:id` takes `reusableCredentialId`, and the old `credentialId`, `credentials` and `sourceStorageId` fields are rejected. Storage responses no longer include `credentials` or `credentialId`.

See [Credentials for Storages](../../docs/storages/manage-storages.md#credentials-for-storages) and [Credentials](../../docs/project/credentials.md).
