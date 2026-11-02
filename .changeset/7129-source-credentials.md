---
'owox': minor
---

<!-- markdownlint-disable-file MD041 MD036 -->

**Rotating a connector key is one change: Sources share reusable Credentials**

**Before you upgrade, check your custom connector templates: a template path no longer steps into text.** `{{ parameters.Key.0 }}` or `{{ record.name.length }}` is now unresolved. That fails the run wherever an unresolved path does, such as a request path, a request body or an authentication field; in a query parameter or a header, the parameter is not sent. See [Templating scopes](../../docs/connectors/manifest-reference.md#templating-scopes).

When a connector key has to be replaced, for example a token about to expire while the colleague who created it is on vacation, whoever maintains it used to replace the same key in every Connector Data Mart, which can be dozens or even hundreds of them, and a copy they missed broke the next run. Custom connectors had the same problem, and testing one in the builder meant typing its key into the browser. Now a configuration selects a reusable Credential instead of keeping its own key: the Credential lists every Data Mart that uses it, replacing its secret applies to all of them, and switching it off stops them all at once. The video follows this for a Facebook Ads token that is about to expire while its creator is on vacation.

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/f85dec35d8cc5084f98a6d8bf8d15509/iframe>

**Existing configurations are converted once, on the first start of this version (or when you run migrations), and keep running. If you run several instances, upgrade all of them together: an instance on an earlier version cannot run a configuration saved on this one, and keeps using a key after its Credential is replaced.** The member who connected a connector's own sign-in owns its Credential, even if they have since left the project; a Project Admin can change its owners. Every other Credential, and a sign-in with no recorded member, is owned by the technical owners of the Data Marts that use it, or by their business owners when a Data Mart has no technical owners. Converted Credentials are Not shared: an owner has to share one for use before others select it elsewhere. A configuration that cannot be converted keeps running on its own key until you select a Credential, and the migration log names it.

- The Data Mart's connector configuration has a **Credential** field in place of the key fields: select a fitting Credential, or click **+ Create new Credential** to add one beside the configuration.
- The **Credentials** page gains a provider for each connector with a key, in the groups **Ads**, **Social**, **E-commerce**, **Currencies** and **Custom connectors**, and lists the Data Marts each Credential is used by. **Sheets Google account** is now **Sheets Destination Google account**, next to the new **Sheets Source Google account**.
- Changing an identity field of a Credential (a Shopify shop domain, a Reddit or Criteo client ID, an AWS access key ID, a Snowflake username) asks for its secrets again, so a Credential never mixes an old secret with a new identity.
- With a Sheets Source Google account Credential, the Data Mart form lists the spreadsheets that Credential can open. Self-managed installs enable the Google Drive API in the Cloud project of the OAuth client for this list.
- In the builder, **Test settings** switches between **Enter values** and **Use a Credential**; with a Credential, the browser never sends or receives the stored values, and the output masks those values, not what an API returns for them. Keys from a Credential work only in requests, and publishing a version that Credentials no longer fit lists the Data Marts that will stop until someone selects a fitting Credential.

**Copy credentials from another Data Mart** is removed: select the same Credential in both Data Marts. **API clients: a connector configuration takes `_credential_id`; new key values, `sourceDataMartId` and `_copiedFrom` are rejected with `This page is out of date. Reload it.` `POST /connectors/custom/test` also takes `credentialId`, which supplies the key values.**

See [Credentials](../../docs/project/credentials.md#source-providers), [Connector Builder](../../docs/connectors/connector-builder.md#step-5-test-on-live-data) and [Key parameters](../../docs/connectors/manifest-reference.md#key-parameters).
