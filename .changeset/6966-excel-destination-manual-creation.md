---
'owox': minor
---

**Create Microsoft Excel destinations from the web app**

**Microsoft Excel** is back in the destination type list. Previously the only
way to get an Excel destination was to let the OWOX add-in for Excel create one
on your first report run. Now you can also add one yourself from the
Destinations page.

![The Destination Type list in the new destination panel, with Microsoft Excel highlighted below Google Sheets](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/60e97892-f23f-4121-d56a-d2e1fc933700/public)

Give it a title and save — there are no credentials to fill in. The automatic
path is unchanged: if your project has no Excel destination you can use, the
add-in still creates one the first time you build a report. See
[Microsoft Excel](../../docs/destinations/supported-destinations/microsoft-excel.md)
for installing the add-in and working with reports.

![The new destination panel with Microsoft Excel selected, showing only a Title field and the Save button](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/5e400ddd-3cf9-4848-becb-975067418c00/public)

Also fixed: picking a "Copy credentials from" source and then switching the
destination type no longer sends that source along with the new destination.
Previously this failed with an error for types that do not use credentials.
