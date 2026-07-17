---
'owox': minor
---

# Explain why a Google Sheets destination folder is unreachable

Saving a Google Sheets destination with a Drive folder validates that the service account can write there. Every failure reported the same cause — "the folder was not found or the service account is not a member" — even when the service account was a Content Manager on the Shared Drive and sharing was never the problem. The most common real cause is the Google Drive API being disabled in the service account's Cloud project, which Drive returns as a 403 that is indistinguishable from a permission error by status alone.

Folder-access failures are now classified from the error body and reported individually:

- **Drive API disabled** — names the Cloud project, links the exact page to enable the API (using the activation URL Google provides), and states that the Sheets API alone does not cover folder placement.
- **Folder not found** — asks the user to check the folder URL as well as Shared Drive membership.
- **Access denied** — points at membership and at organization-level Drive sharing policies.

The document auto-creation path reports a disabled Drive API the same way, instead of suggesting a sharing change that cannot help. The underlying Google error is also logged as part of the log message rather than as a Nest logger context, so it is visible when diagnosing.

Documentation now includes a step for enabling the Google Drive API and a troubleshooting section covering each folder-access message.
