---
'owox': minor
---

**Plugins can call Google APIs with a service account**

A new built-in **Google Service Account** Credential stores a service account JSON key. A plugin that declares `google-service-account` with OAuth scopes in `plugin.json` calls Google APIs, such as Google Docs and Google Sheets, through the Credential: OWOX Data Marts mints the access token and adds it to each request, so neither the plugin page nor its backend sees the key or the token.

The video saves a service account key, installs a plugin that asks for Google Docs and Google Sheets scopes, and has the plugin add a ROAS check to the end of a Google Doc and as a row of a Google Sheet:

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/71f0bce74f0da5c394433b2bc2fda673/iframe>

- The Credential form takes the key as pasted JSON or a dropped file and shows the service account address to share documents with.
- A key Google rejects is refused on save, and a replacement key must belong to the same service account.
- The install dialog lists the scopes a plugin asks for.
- When Google refuses a stored key during a request, the plugin gets `CREDENTIAL_REJECTED` and the Credential is marked as rejected, and the Credentials page's Validation filter lists it.
- Once a project saves a Google Service Account Credential, an earlier version cannot list that project's Credentials, so roll back only after deleting such Credentials.

See [Use project Credentials](../../docs/plugins/authoring-guide.md#use-project-credentials).

<!-- markdownlint-disable-file MD041 MD036 -->
