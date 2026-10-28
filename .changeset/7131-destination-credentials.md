---
'owox': minor
---

<!-- markdownlint-disable-file MD041 MD036 -->

**Reuse one Google Sheets or Google Chat key across Destinations**

**Existing Google Sheets and Google Chat Destinations are converted once, on the first start of this version (or when you run migrations), and keep running; no action is needed.** A Google account Destination whose stored sign-in lacks a permission the Sheets Google account Credential requires stops until you reconnect its Credential; the migration log names each one. Every owner of a Destination owns its Credential. Converted Credentials are Not shared, whatever the Destination's sharing: members who maintain a Destination without owning it can still use and edit it, but reuse its key elsewhere only after an owner shares the Credential. Identical keys of Destinations with the same owners become one Credential. A Destination whose key cannot be converted keeps running on its own key until you select a Credential.

Each Google Sheets or Google Chat Destination used to keep its own service account key, Google account or webhook URL. Using one key in two Destinations meant copying it, and rotating a key, for example after someone who had it leaves the company, meant finding and editing every copy. The Destination form now has a **Credential** field: select a Credential that fits, or click **+ Create new Credential** to add one beside the form; the form then selects the new Credential. With exactly one fitting Credential, a new Destination selects it for you. Replacing a Credential's secret updates every Storage and Destination that uses it, as the video shows.

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/7a6ec641d0c2e9c46803ef845b09b541/iframe>

- **Google Sheets** Destinations use a Google Service Account or a Sheets Google account Credential. The Google Drive permission (`drive.file`) is optional for a Sheets Google account: without it, reports still write, and **Create document** still creates the spreadsheet, but in the account's Drive root, outside the selected folder and not shared with you.
- **Google Chat** Destinations with webhook delivery use a Google Chat webhook Credential. Channel email delivery keeps its addresses on the Destination.
- The **Credentials** page gains the Sheets Google account and Google Chat webhook providers, lists the Destinations each Credential is used by, and does not delete a Credential that a Destination uses. The BigQuery Service Account provider is now called **Google Service Account**, because one key serves a BigQuery Storage and a Google Sheets Destination.

**Copy credentials from another destination** is removed: select the same Credential in both Destinations. **API clients: `POST /data-destinations` and `PUT /data-destinations/:id` take `reusableCredentialId` for Google Sheets and Google Chat webhook delivery and reject the old `credentialId`, `sourceDestinationId` and key `credentials` fields. The Destination Google OAuth routes are removed: `POST /data-destinations/oauth/authorize`, `POST /data-destinations/oauth/exchange`, `GET /data-destinations/oauth/credential-status/:credentialId`, `POST /data-destinations/:id/oauth/authorize`, `GET /data-destinations/:id/oauth/status` and `DELETE /data-destinations/:id/oauth`; connect a Google account from the Credential instead.** Destination responses no longer include `credentialId` for these types; `credentials` keeps only the public parts, as before: the service account email and project, the Google account, or that a webhook is set.

See [Google Sheets](../../docs/destinations/supported-destinations/google-sheets.md), [Google Chat](../../docs/destinations/supported-destinations/google-chat.md) and [Credentials](../../docs/project/credentials.md).
