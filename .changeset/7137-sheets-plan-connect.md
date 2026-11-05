---
'owox': minor
---

<!-- markdownlint-disable-file MD041 MD036 -->

**Connect a Google Sheets plan with one Google sign-in**

Before this release, Sign in with Google failed on the Credentials page for a Sheets Source Google account. The error was "Failed to open popup window". When the popup opened, Google asked for access a second time to choose a spreadsheet. Now one sign-in adds the account, and the spreadsheet picker opens immediately.

The video connects two plans to Data Marts with one Google account. The second plan uses "+ Add spreadsheet" in the Data Mart form, and the form shows a warning when another Data Mart already writes to the same table.

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/58a165f0d51ac5ce59dd95177940f617/iframe>

- The spreadsheet list in the Data Mart form has a "+ Add spreadsheet" item at the end. You can add a new plan without leaving the form. A Google window opens and closes by itself, then the spreadsheet picker opens.
- To add spreadsheets, sign in to Google with the account of the Credential. If the form shows "Sign in to Google as … to add spreadsheets.", click "+ Add spreadsheet" again and choose that account.
- If a Credential shows no Google account, reconnect it to add spreadsheets.
- When you choose the spreadsheet from the list or with "+ Add spreadsheet", the suggested table name has the document name and the sheet name, for example `budget_2026_plan`. Two documents with a "Plan" sheet then do not get the same table name.
- When you type the spreadsheet URL, or the Credential is a service account, the suggested table name has the sheet name only, for example `plan`.
- The form suggests a table name only when the target table is empty.
- Ukrainian and Russian names change to Latin letters, for example `data_soft_potochni_vytraty`. A table name has 100 characters or fewer. Tables of existing Data Marts keep their names.
- Target Setup shows a warning when another Data Mart writes to the same table. Each run replaces the table, so the two Data Marts overwrite the data of each other.
- If the spreadsheet list cannot load, the form shows "Could not load the list of spreadsheets." and the cause from Google Sheets. You can still type the spreadsheet URL manually.
