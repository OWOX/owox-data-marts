---
'owox': minor
---

<!-- markdownlint-disable-file MD041 MD036 -->

**Rotating a warehouse key is one change: Storages share reusable Credentials**

When a warehouse key leaks or has to be rotated, whoever maintains it used to open every Storage to find the ones holding a copy, and a copy they missed broke once the old key was revoked. Now a Storage selects a reusable Credential instead of keeping its own key: the Credential lists every Storage that uses it, replacing its secret applies to all of them, and switching it off stops them all at once.

**Existing Storages are converted once, on the first start of this version (or when you run migrations), and keep running; no action is needed.** Every owner of a Storage owns its Credential, Business Users included: they can edit, share and delete the Credential, but still cannot run or edit the Storage. Converted Credentials are Not shared, whatever the Storage's sharing: members who run or maintain a Storage without owning it keep doing so, but an owner has to share the Credential for use before they change where the Storage connects (project, region, account or host) or reuse its key elsewhere, and for maintenance before they replace its key. Identical keys of Storages with the same owners become one Credential, which keeps only the Contexts all its Storages shared. A Storage whose key cannot be converted keeps running on its own key until you select a Credential.

The Storage form now has a **Credential** field in place of the authentication method and key fields: select a Credential that fits the Storage type, or click **+ Create new Credential** to add one beside the form and select it on save. With exactly one fitting Credential, a new Storage selects it for you. The **Credentials** page gains Storage providers (BigQuery Service Account, BigQuery Google account, AWS access key, Snowflake password, Snowflake key pair, Databricks token), lists the Storages each Credential is used by, and does not delete a Credential that a Storage uses. The video follows a key pasted into a team chat: the Credential shows which Storages use it, where to replace it once, and where to switch it off.

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/888fb6c28ce0e445d05e112676070a39/iframe>

**Copy credentials from another storage** is removed: select the same Credential in both Storages. `PUT /data-storages/:id` takes `reusableCredentialId`, and the old `credentialId`, `credentials` and `sourceStorageId` fields are rejected. Storage responses no longer include `credentials` or `credentialId`.

See [Credentials for Storages](../../docs/storages/manage-storages.md#credentials-for-storages) and [Credentials](../../docs/project/credentials.md).
