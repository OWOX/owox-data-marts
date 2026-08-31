# Microsoft Excel

Use **Microsoft Excel** as a Destination so business users can browse published Data Marts, create a report, and refresh it without leaving the workbook.

You do not create this destination in the OWOX web app. Install the add-in, sign in, and build a report — the destination appears automatically and stores no credentials. The add-in reads the report using your OWOX access and writes the rows into the worksheet you opened it from.

A workbook is not reachable from a server, so refresh happens in Excel with the workbook open. Scheduled refresh is not offered, and Excel reports cannot be created from the Destinations tab.

---

## Prerequisites

- An [OWOX Data Marts](https://app.owox.com) account with at least one **published** Data Mart. The add-in reads what you already have; it does not create Data Marts. See [Quick Start](../../getting-started/quick-start.md) if you are setting OWOX up for the first time.
- Excel on the web, Microsoft 365 on Windows or Mac, or Excel 2019 or later on Mac. Perpetual Windows builds (2016, 2019, 2021) are not supported.

---

## Install the add-in

The add-in is installed from a **manifest** — a small XML file that tells Excel where the add-in lives and what it may do. You download it once and add it to Excel; the add-in itself is served by OWOX and updates on its own.

Installing from a manifest is a standard Microsoft mechanism, not a workaround. Organizations use it to deploy add-ins that are not published to the store, to pilot a version before rolling it out, and to install add-ins where access to AppSource is restricted.

### Step 1. Download the manifest

Download **[manifest.xml](https://addins.owox.com/excel/manifest.xml)** and keep it somewhere you can find again — you will point Excel at this file, and on Windows and Mac it has to stay in place.

> 💡 Right-click the link and choose _Save link as…_. A browser that displays the XML instead of downloading it has still fetched the right file — use _Save page as…_.

### Step 2. Add it to Excel

The steps differ per platform. Excel on the web is the quickest, and a good way to confirm everything works before installing it on a desktop.

#### Excel on the web

1. Open a workbook at [excel.cloud.microsoft](https://excel.cloud.microsoft).
2. On the **Home** tab, select **Add-ins**.
3. In the dialog, select **More Add-ins** → the **My Add-ins** tab.
4. Select **Upload My Add-in** in the top right.
5. **Browse** to `manifest.xml`, then select **Upload**.

The **OWOX Data Marts** tab appears on the ribbon.

> The upload applies to the browser you are in. Signing in from another browser or another machine means uploading the manifest there too.

#### Excel on Windows

Windows installs add-ins from a **shared folder** that you register as a trusted catalog, rather than from a file you pick each time.

1. Create a folder for the manifest, for example `C:\OWOX\addin`, and put `manifest.xml` in it.
2. Right-click the folder → **Properties** → **Sharing** → **Share…**, share it with yourself, and copy the resulting network path (it looks like `\\YOUR-PC\addin`).
3. In Excel, go to **File** → **Options** → **Trust Center** → **Trust Center Settings…** → **Trusted Add-in Catalogs**.
4. Paste the network path into **Catalog Url**, select **Add catalog**, tick **Show in Menu**, then **OK**.
5. **Close and reopen Excel** — the catalog is read at startup.
6. Go to **Home** → **Add-ins** → **More Add-ins** → **SHARED FOLDER**, select **OWOX Data Marts**, then **Add**.

> ⚠️ The path in step 4 must be the **network** path (`\\...`), not the local one (`C:\...`). A local path is accepted by the dialog and then shows an empty catalog.

#### Excel on Mac

1. Open a Finder window and press **⌘⇧G**.
2. Go to:

   ```text
   ~/Library/Containers/com.microsoft.Excel/Data/Documents/wef
   ```

   If the `wef` folder does not exist, create it.

3. Copy `manifest.xml` into that folder.
4. **Close and reopen Excel.**
5. Go to **Home** → **Add-ins** → **More Add-ins** → **My Add-ins**, select **OWOX Data Marts**, then **Add**.

### Step 3. Sign in

Select **Launch** on the **OWOX Data Marts** ribbon tab. The add-in signs you in with the Microsoft account Excel is already using, and matches it to your OWOX account **by verified email address** — so the Microsoft account you use in Excel must be the one your OWOX account was created with.

Depending on your account and where the workbook is stored, Excel either signs you in without asking or opens a sign-in window once. Both are normal.

---

## Create your first report

1. Open the worksheet you want the data in — or let the add-in add one for you with **Create report**.
2. Pick a published Data Mart, choose columns and any filters, then **Create & Run**.
3. The rows land in the sheet, with column names taken from your Output Schema and each header carrying a note describing the column.

To refresh later, use **Refresh this sheet** or **Refresh all** on the ribbon.

---

## Keeping it up to date

You do not reinstall to get a new version. The manifest points at OWOX-hosted files, so improvements arrive the next time the task pane is opened. You only download the manifest again if we tell you the manifest itself has changed — a new ribbon button, for example.

---

## Removing the add-in

- **Web:** **Home** → **Add-ins** → **More Add-ins** → **My Add-ins**, then remove **OWOX Data Marts**.
- **Windows:** remove the catalog under **Trust Center** → **Trusted Add-in Catalogs**, then restart Excel.
- **Mac:** delete `manifest.xml` from the `wef` folder, then restart Excel.

---

## Troubleshooting

Most problems fall into three groups: Excel cannot load the add-in, the add-in cannot sign you in, or OWOX does not recognise the account you signed in with. Work down the section that matches what you see.

### The add-in does not appear after installing

**On Windows, the shared folder is empty.** The catalog path must be the **network** path (`\\YOUR-PC\addin`), not the local one (`C:\OWOX\addin`). The dialog accepts a local path and then lists nothing. Fix the path, then close and reopen Excel — catalogs are read at startup.

**On Mac or Windows, nothing changed.** Both platforms read the manifest when Excel starts. A restart means quitting Excel entirely, not just closing the workbook.

**Your organization blocks it.** Some tenants disable add-ins that are not centrally deployed. If installing appears to work but the add-in never lists, ask your Microsoft 365 administrator whether add-in installation is restricted — they can deploy it for everyone from the admin center using the same manifest.

### The task pane opens blank

Usually a cached page pointing at files that no longer exist. Clearing the Office cache fixes it:

- **Web:** hard-refresh the browser tab, or open the workbook in a private window.
- **Windows:** delete the contents of `%LOCALAPPDATA%\Microsoft\Office\16.0\Wef\`, then restart Excel.
- **Mac:** delete the contents of `~/Library/Containers/com.microsoft.Excel/Data/Library/Caches/`, then restart Excel.

If it is still blank, the add-in can describe the host it is running on. Open the task pane's developer console and run:

```js
owoxHostDiagnostics();
```

It prints the Office platform, the highest Excel API version available, and which capabilities are present. Include that output if you contact support — it is the difference between an Excel that cannot do something and one that simply did not.

### Sign-in does not complete

**A window opens and closes without signing you in.** Close the task pane and open it again, then press the sign-in button rather than waiting. A sign-in window has to be opened by a button press; if the press is spent elsewhere the browser refuses the window.

**Nothing happens on the web.** Excel on the web can only sign you in silently for workbooks stored in SharePoint Online or OneDrive for Business. For a workbook stored anywhere else — including most personal accounts — a sign-in window opens instead. That is the normal path, not a fallback that failed.

**"This copy of Excel cannot sign you in."** The Excel build is older than the add-in supports. The add-in needs Excel API 1.12, which is where the feature that binds a report to a worksheet arrives. Excel on the web, Microsoft 365 on Windows and Mac, and Excel 2019 or later on Mac all qualify; perpetual Windows builds (2016, 2019, 2021) do not.

### "OWOX does not recognise this account"

Sign-in succeeded with Microsoft and then OWOX declined it. The two systems are matched **by verified email address**, so:

- **The email is not the one OWOX knows you by.** Check which account Excel is signed in as — the add-in shows it under the ⋯ menu — and compare it with the email on your OWOX profile. They must be the same address.
- **The email is not verified on the Microsoft side.** Some accounts, especially personal ones, carry an address Microsoft has not verified. OWOX cannot accept an unverified address as identity. Verifying the email with Microsoft, or signing in with your work account, resolves it.
- **You have no OWOX account yet.** The add-in cannot create one. Sign up at [app.owox.com](https://app.owox.com) first, then sign in again.

### Notes on column headers look cut off

Excel gives a note a fixed box and does not grow it to fit. The add-in sizes each note to its text on desktop, but **Excel on the web does not support setting a note's size at all** — the text is there, and dragging the note's edge reveals the rest.

### A refresh reports nothing, or the wrong sheet changed

**The report is not linked to a worksheet in this workbook.** Refreshing a report opened from **All reports** writes into the sheet that report is bound to. If the binding is gone — the sheet was deleted, or the report was created in a different workbook — the add-in says so rather than guessing, because writing begins by clearing the sheet.

**Two sheets answer to the same report.** Copying a worksheet copies its binding with it. The add-in refreshes the sheet you are looking at when it is one of them; otherwise it takes the first. Delete the binding you do not want by removing the copied sheet.

### Still stuck

Contact support with:

- what you did and what you saw, including exact error text;
- the output of `owoxHostDiagnostics()`;
- whether you are on the web, Windows or Mac, and whether the workbook is in OneDrive/SharePoint or stored locally.
