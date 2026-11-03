---
'owox': minor
---

<!-- markdownlint-disable-file MD041 MD036 -->

**Connecting a Google Sheets plan is easier: no blocked popup, no second Google sign-in**

Adding a Sheets Source Google account on the Credentials page used to fail right after Sign in with Google with "Failed to open popup window", and choosing a spreadsheet asked for Google access a second time. Now the account is added in one sign-in and the spreadsheet picker opens straight away.

- The Data Mart form has "+ Add spreadsheet" at the end of the spreadsheet list, so a new plan no longer means leaving the form. Only the person who connected the Google account can add spreadsheets with it; everyone else sees who that is.
- The suggested table name now joins the document and the sheet, such as `budget_2026_plan`, so two documents with a "Plan" tab no longer default to one table. Ukrainian and Russian names become Latin, such as `data_soft_potochni_vytraty`, and names stay within 100 characters. Tables of existing Data Marts keep their names.
- Target Setup warns when another Data Mart already writes the chosen table, because each run replaces it.
- When the spreadsheet list cannot load, the form says why in one sentence and keeps the manual input.
