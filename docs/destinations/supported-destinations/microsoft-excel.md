# Microsoft Excel

Use **Microsoft Excel** as a Destination. You can browse published Data Marts, create a report, and refresh it inside the workbook.

You can create this destination in the OWOX web app, or let the add-in create it for you. Install the **OWOX Data Marts** add-in from the [Office Add-ins store](https://marketplace.microsoft.com/en-us/product/WA200011946?src=owox_data_marts&mktcmpid=docs-excel&ocid=docs-excel&utm_source=owox_data_marts&utm_medium=docs&utm_campaign=docs-excel) inside Excel, sign in, and build a report. If you have no Excel destination you can use, the add-in creates one, and it appears in your **Destinations** list. If your project has more than one Excel destination, the add-in asks which one to use when you create a report. Either way the destination stores no credentials. The add-in reads the report with your OWOX access and writes rows into a worksheet in your workbook.

Scheduled refresh is not available, and you cannot create Excel reports from the **Destinations** tab.

---

## Requirements

| Requirement | Details |
|---|---|
| OWOX account | An account at [app.owox.com](https://app.owox.com) with access to at least one **published** Data Mart. New to OWOX? Start with the [Quick Start](../../getting-started/quick-start.md). |
| Matching email | The Microsoft account in Excel must use the same email as your OWOX profile. Microsoft must verify that email. |
| Excel version | Excel on the web, Microsoft 365 on Windows or Mac, or Excel 2019 or later on Mac. The add-in does not support perpetual Excel 2019 and 2021 on **Windows**. |
| Account type | A work or school account, or a personal Microsoft account. |
| Marketplace access | If your organization turned off Marketplace access for users, you cannot self-install. Admins control this with the setting that turns Microsoft Marketplace on or off for all apps except Outlook. An admin must then deploy the add-in centrally. |
| Admin deployment path | Microsoft 365 admin center → **Settings** → **Integrated apps**. This is the recommended route. The older **Add-ins** page under Integrated apps is the fallback. A global admin assigns the add-in to a user, a group, or the whole tenant. |
| Licensing for central deployment | Microsoft 365 Business (Basic, Standard, Premium), Office 365 Enterprise (E1, E3, E5, F3), or Microsoft 365 Enterprise (E3, E5, F3). |
| Identity and mailbox | Users sign in to Microsoft 365 with organizational credentials and have Exchange Online mailboxes. The subscription directory must live in, or federate to, Microsoft Entra ID. Central deployment does not work with on-premises Exchange. |
| Network | Your proxy or firewall must allow the OWOX-hosted add-in domain and Microsoft's Marketplace and CDN endpoints. The listing declares that the app can read and change the document and send data over the internet. Flag this for security review. |

---

## Install the add-in

### From the Office Add-ins store

The store lives inside Excel. It is not the Windows **Microsoft Store** app.

1. Open any workbook.
2. On the **Home** tab, select **Add-ins**.
3. Select **More Add-ins**, then open the **Store** tab.
4. Search for **OWOX Data Marts** and select **Add**.
5. Review the license and privacy terms, then select **Continue**.

> 💡 Older desktop builds show the store under **Insert** → **Get Add-ins** instead.

![Office Add-ins dialog in Excel with the Store tab open, OWOX Data Marts in the search results, and the Add button highlighted](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/728b8894-403e-4d10-9661-510227c4d600/w=800)

The **OWOX Data Marts** tab appears on the ribbon. Select **Launch sidebar** to open the task pane. Excel may ask you to trust the add-in on first launch. That prompt is expected.

> 💡 You can also start from the [Microsoft Marketplace listing](https://marketplace.microsoft.com/en-us/product/WA200011946?src=owox_data_marts&mktcmpid=docs-excel&ocid=docs-excel&utm_source=owox_data_marts&utm_medium=docs&utm_campaign=docs-excel). Select **Get it now** and follow the prompts to open Excel.

The add-in installs per Microsoft account. It follows you to every device where you sign in with the same account.

![OWOX Data Marts listing on Microsoft Marketplace with the Get it now button highlighted](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/1c6cf455-867a-4ece-9f0f-2a0f38603300/w=800)

### For your organization

Administrators can install the add-in for selected users, groups, or the whole tenant. Check the central deployment rows in [Requirements](#requirements) first.

1. Open the [Microsoft 365 admin center](https://admin.microsoft.com).
2. Go to **Settings** → **Integrated apps** → **Get apps**.
3. Search for **OWOX Data Marts** and select **Get it now**.
4. Choose the users or groups, review permissions, and select **Finish deployment**.

Deployed add-ins can take up to 24 hours to appear on the ribbon. Ask users to fully restart Excel after that.

### Sign in

1. Select **Launch sidebar** on the **OWOX Data Marts** ribbon tab.
2. Select **Sign in**. The add-in uses the Microsoft account Excel already uses.
3. OWOX matches that account to your profile by verified email address.

Excel on the web signs you in silently for workbooks in OneDrive for Business or SharePoint Online. Other workbooks open a Microsoft sign-in window instead. Both are normal.

If Excel is not signed in, or uses the wrong account, sign in to Excel first. On desktop, go to **File** → **Account**. On the web, use the profile icon in the top-right corner. Then open the task pane again.

![Excel with the OWOX Data Marts ribbon tab active and the task pane showing the Sign in button](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/61dc2d2c-edc1-428b-acbe-f006f78b6400/w=800)

---

## Work with reports

### Create a report

1. Choose where the data goes. Select **Add report** in the task pane to use the active worksheet. Select **New report** on the ribbon to add a worksheet first.
2. In the task pane, pick a published Data Mart.
3. Choose columns, filters, and sort order. See [Report Output Controls](../../getting-started/setup-guide/output-controls.md) for what each control does.
4. Select **Create & Run**.

The rows land in the sheet. Column names and descriptions come from the Data Mart, as your data team defined them. Each header carries a note with the description.

The add-in binds the report to that worksheet. Later refreshes write into the same sheet.

![Excel with the New report ribbon button and the Add report button in the OWOX Data Marts task pane highlighted](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/9d5f35b0-7f40-4120-596c-333802385c00/w=800)

### Refresh a report

Use the ribbon buttons on the **OWOX Data Marts** tab:

- **Refresh current report** reruns the report bound to the active worksheet.
- **Refresh all reports** reruns every report in the workbook.

You can also open **All reports** in the task pane and refresh a report from the list.

A refresh rewrites only the columns the report imported and leaves the rest of the sheet to you. These rules match a [Google Sheets](google-sheets.md#working-with-imported-data) report:

- **Your column order stays.** Drag imported columns into any order; the next refresh writes each field into the column that now holds it. Fields match by their name in the Data Mart, not by position. An alias in the header does not change the matching.
- **New report columns** appear at the right edge of the imported range, and your content to the right shifts right. **Removed** report columns disappear; a formula that pointed at one shows `#REF!`.
- **Formulas and columns to the right of the imported range survive.** The add-in fills a row-2 formula in such a column down to the last data row on every refresh. It leaves a static value in row 2 alone, so lookup tables and notes stay as you wrote them.
- **Your formats on imported columns survive.** A date or currency format you set on a column stays across refreshes.
- **Fewer rows than last time** clear the imported cells below the new last row. A formula you filled down in a column to the right stays in place and now points at empty cells.
- **If the refresh fails before any data arrives**, the sheet stays as it was.

Keep your own columns **to the right** of the imported range. Inside that range, Excel does this:

- **A value or formula typed in an imported cell disappears** on the next refresh. The refresh rewrites that cell.
- **The refresh deletes a column you insert between imported columns.** It writes each imported field in the column the field moved to. No second copy remains.
- **A retyped header is not a report field.** If an imported header still sits to its right, the refresh deletes the retyped column. It writes that field again at the right edge of the imported range. If the retyped header is the last imported column, the refresh leaves it in place. It writes the field again at the right edge. The retyped column stays just past the imported range until you delete it.
- **Excel Tables** over the imported columns do not survive a refresh. The add-in removes the table and rewrites the cells as a plain range. Keep tables to the right of the imported range or on another sheet.
- **On the first refresh** the add-in freezes row 1 and colors the tab. Unfreeze or recolor as you like; the add-in does not set them again.

After you update the add-in, the first refresh of an existing sheet writes from column A in the report's order. It does not clear the sheet. If the report lost columns, the old ones — with their data and header notes — stay to the right. Delete them once by hand.

### Share the workbook

Anyone who opens the workbook sees the values from the last refresh. The cells hold plain data, so no add-in is needed to read them.

To refresh, a colleague needs the add-in and an OWOX account with access to the Data Mart. The report bindings travel with the workbook, so they refresh the same sheets.

### Column header notes

Each header note holds the column description from the Data Mart. On Windows and Mac, the add-in sizes the note to fit its text. Excel on the web cannot resize notes, so drag the note's edge to read the rest.

### Copy or delete a sheet

- Copying a worksheet copies the values, not the report. The copy has no binding and no column layout, so a refresh never touches it. To refresh the same data on another sheet, create a report there.
- Deleting a bound sheet removes the binding. The report stays in **All reports**, but a refresh reports that it lost the sheet.

### Limits

- No scheduled refresh. Refresh runs only while the workbook is open in Excel.
- One report per worksheet.
- Excel holds about 1,048,576 rows per sheet. Narrow large Data Marts with filters before you run them.
- Reports read what your OWOX access allows. Ask a Data Mart owner to publish a Data Mart you cannot see.

---

## Update the add-in

Store installs update automatically. You never reinstall to get a new version.

## Remove the add-in

- **Store install:** go to **Home** → **Add-ins** → **More Add-ins** → **My Add-ins**. Select **⋯** next to **OWOX Data Marts**, then **Remove**.
- **Admin deployment:** the administrator removes it under **Integrated apps**.

---

## Troubleshooting

Find the symptom you see and follow the fix.

### I cannot find the add-in in the store

**Your tenant blocks store add-ins.** Some organizations turn off the Office Add-ins store. Ask your Microsoft 365 administrator to [deploy the add-in centrally](#for-your-organization).

**Excel disables the Add button, or says your admin turned off the store.** Same cause, same fix.

**You searched the Windows Microsoft Store app.** The add-in lives in the store inside Excel. See [Install the add-in](#from-the-office-add-ins-store).

### My admin deployed it, but it is not on my ribbon

Central deployment can take up to 24 hours to reach every user. After that:

1. Quit Excel completely, not just the workbook.
2. Reopen Excel and check the **Home** tab.
3. Ask the administrator to confirm you belong to an assigned user or group.

### The task pane opens blank

Excel cached an old page. Try these in order:

1. Close every Office app, then reopen Excel.
2. **Web:** hard-refresh the browser tab, or open the workbook in a private window.
3. **Windows:** delete the contents of `%LOCALAPPDATA%\Microsoft\Office\16.0\Wef\`, then restart Excel. Ask IT if the folder is locked.
4. **Mac:** delete the contents of `~/Library/Containers/com.microsoft.Excel/Data/Library/Caches/`, then restart Excel.

Still blank on the web? Press **F12**, open the **Console** tab, and run:

```js
owoxHostDiagnostics();
```

The output lists the Office platform, the Excel API version, and available capabilities. Include it when you contact support. On Windows or Mac, skip this step and contact support directly.

### Sign-in does not complete

**A window opens and closes without signing you in.** Close the task pane, open it again, and press **Sign in** yourself. Browsers only allow a sign-in window that a button press opens.

**Nothing happens on the web.** Excel on the web signs you in silently only for workbooks in SharePoint Online or OneDrive for Business. Other workbooks open a sign-in window. That is the normal path.

**"Need admin approval" appears.** Your organization requires admin consent before an add-in can sign users in. Ask your Microsoft 365 administrator to grant consent for **OWOX Data Marts** under **Microsoft Entra ID** → **Enterprise applications**. Sign in again after they approve.

**"This copy of Excel cannot sign you in."** Your Excel build is too old. See [Requirements](#requirements).

### "OWOX does not recognise this account"

Microsoft signed you in, but OWOX declined the account. OWOX matches accounts by verified email address.

- **Different email.** Open the **⋯** menu in the task pane to see the signed-in account. Compare it with your OWOX profile email. They must match.
- **Unverified email.** Personal Microsoft accounts often carry an unverified address. Verify it with Microsoft, or sign in with your work account.
- **No OWOX account.** The add-in cannot create one. Sign up at [app.owox.com](https://app.owox.com), then sign in again.

### A report run fails or returns no rows

The task pane shows the error from OWOX. Common causes:

- **The Data Mart is unpublished, or you lost access.** Ask the Data Mart owner in OWOX.
- **The storage connection or query failed.** Your data team fixes it in OWOX. Run the report again after the Data Mart runs there.
- **The filters exclude every row.** Edit the report and loosen the filters.
- **The result is too large for Excel.** Narrow the report with filters.

### Header notes look cut off

Excel on the web cannot resize notes. The full text is there. Drag the note's edge to reveal it.

### A refresh reports nothing, or the wrong sheet changed

**The report lost its worksheet.** Someone deleted the bound sheet, or the report belongs to another workbook. The add-in stops instead of guessing, because a refresh rewrites the imported columns of whichever sheet it picks.

### Still stuck

Contact us at `bi@owox.com` or open a thread in [GitHub Discussions](https://github.com/OWOX/owox-data-marts/discussions). Include:

- what you did and what you saw, with exact error text;
- the output of `owoxHostDiagnostics()` if you are on the web;
- your platform: web, Windows, or Mac;
- where the workbook lives: OneDrive, SharePoint, or a local disk.
