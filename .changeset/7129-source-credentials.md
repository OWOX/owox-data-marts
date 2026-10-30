---
'owox': minor
---

<!-- markdownlint-disable-file MD041 MD036 -->

**Rotating a connector key is one change: Sources share reusable Credentials**

When a connector key has to be rotated, for example after someone who had it leaves the company, whoever maintains it used to open every Connector Data Mart and replace its own copy, and a copy they missed broke the next run. Custom connectors had the same problem, and testing one in the builder meant typing its key into the browser. Now a configuration selects a reusable Credential instead of keeping its own key: the Credential lists every Data Mart that uses it, replacing its secret applies to all of them, and switching it off stops them all at once. The video follows this for a Facebook Ads token whose creator has left the company.

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/19c94457fcf741af1ea3ce626b6aea72/iframe>

**Existing configurations are converted once, on the first start of this version (or when you run migrations), and keep running; no action is needed.** The member who connected a connector's own sign-in owns its Credential, even if they have since left the project; a Project Admin can change its owners. Every other Credential, and a sign-in with no recorded member, is owned by the technical owners of the Data Marts that use it, or by their business owners when a Data Mart has no technical owners. Converted Credentials are Not shared: an owner has to share one for use before others select it elsewhere. A configuration that cannot be converted keeps running on its own key until you select a Credential, and the migration log names it.

- The Data Mart's connector configuration has a **Credential** field in place of the key fields: select a fitting Credential, or click **+ Create new Credential** to add one beside the configuration.
- The **Credentials** page gains a provider for each connector with a key, in the groups **Ads**, **Social**, **E-commerce**, **Currencies** and **Custom connectors**, and lists the Data Marts each Credential is used by. **Sheets Google account** is now **Sheets Destination Google account**, next to the new **Sheets Source Google account**.
- Changing an identity field of a Credential (a Shopify shop domain, a Reddit or Criteo client ID, an AWS access key ID, a Snowflake username) asks for its secrets again, so a Credential never mixes an old secret with a new identity.
- With a Sheets Source Google account Credential, the Data Mart form lists the spreadsheets that Credential can open. Self-managed installs enable the Google Drive API in the Cloud project of the OAuth client for this list.
- In the builder, **Test settings** switches between **Enter values** and **Use a Credential**; with a Credential, the browser never sends or receives the stored values, and the output masks those values, not what an API returns for them. Keys from a Credential work only in requests, and publishing a version that Credentials no longer fit lists the Data Marts that will stop until someone selects a fitting Credential.

**Copy credentials from another Data Mart** is removed: select the same Credential in both Data Marts. **API clients: a connector configuration takes `_credential_id`; new key values, `sourceDataMartId` and `_copiedFrom` are rejected with `This page is out of date. Reload it.` `POST /connectors/custom/test` also takes `credentialId`, which supplies the key values.**

See [Credentials](../../docs/project/credentials.md#source-providers), [Connector Builder](../../docs/connectors/connector-builder.md#step-5-test-on-live-data) and [Key parameters](../../docs/connectors/manifest-reference.md#key-parameters).
