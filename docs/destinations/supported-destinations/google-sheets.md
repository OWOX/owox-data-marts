# Google Sheets

Google Sheets is a cloud-based spreadsheet application that allows users to create, edit, and collaborate on spreadsheets in real-time.  
Configure Google Sheets as a **Destination** in OWOX Data Marts to enable business users to access and analyze data directly within their spreadsheets.

---

## Configuration Steps

### Google Cloud Console

#### 1. Enable the Google Sheets API

To allow OWOX Data Marts to interact with Google Sheets, enable the Google Sheets API in your Google Cloud project.

1. Sign in to your Google account and open the [Google Sheets API](https://console.cloud.google.com/apis/library/sheets.googleapis.com/) page.
2. Click **Enable** to activate the API for your project.
3. If it's already enabled, you'll see the API dashboard — that's fine.

#### 2. Enable the Google Drive API

Enable the [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com/) in the **same** project if you want OWOX to create new spreadsheets for you inside a Drive folder.

The Sheets API can read and write spreadsheets, but it cannot place a file into a folder — that is a Drive operation. If this API is off, saving a destination with a folder fails with a message telling you the Drive API is not enabled, and pointing at the page to enable it.

> **Note:** After enabling, allow up to a minute for the change to propagate before retrying.

#### 3. Create a Service Account and JSON Key

A service account is required to authenticate OWOX Data Marts with Google Sheets.

1. Navigate to **IAM & Admin** > **Service Accounts** in the [Google Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts).
2. Create a new service account or select an existing one.
3. On the Service Accounts page, find the service account to use in OWOX Data Marts and click the **Actions** menu (three dots).
4. Select **Manage keys**, then click **Add Key** > **Create new key**.
5. Choose **JSON** and click **Create**.
6. Download the JSON key file.

---

### OWOX Data Marts

#### 1. Access the Destinations Page

In the OWOX Data Marts web application, navigate to **Destinations** from the main navigation pane and click **+ New Destination**.

#### 2. Choose Destination Type

Select **Google Sheets** from the **Destination Type** dropdown.

#### 3. Set Configuration Details

- **Title**: Provide a unique name for this **Destination** (e.g., "Marketing Reports").

#### 4. Choose Authentication Method

OWOX Data Marts supports two authentication methods for Google Sheets:

##### Option A: Service Account (JSON Key)

Paste the JSON key file from your Service Account into the **Service Account JSON** field. This method is recommended for automated, unattended workflows.

##### Option B: Google OAuth

Click **Connect Google Account** to authenticate using your personal Google account via OAuth. You will be redirected to Google's consent screen to grant access. Once authorized, your account will be linked to this Destination.

> **Note:** OAuth tokens are automatically refreshed. If your session expires or access is revoked, you can reconnect at any time by clicking **Connect Google Account** again.

#### 5. Finalize Setup

Review your entries and click **Save** to integrate the **Destination**, or **Cancel** to discard changes.

---

## Troubleshooting Folder Access

When a **Destination** has a Drive folder configured, OWOX checks that it can actually write there before saving, so problems surface at setup time instead of during a refresh. If the save fails, match the message below:

- **"The Google Drive API is not enabled..."** — enable the [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com/) in the Cloud project named in the message (the one your service account key belongs to), wait a minute, then save again. The Google Sheets API being enabled does not cover folder placement.
- **"The Drive folder was not found, or the service account is not a member..."** — check the folder URL you pasted, then open the folder's Shared Drive, click **Manage members**, and add the service account's email as a member.
- **"Google Drive denied the service account access..."** — the account is known to Drive but not allowed in. Confirm its membership on the Shared Drive and check whether an organization-level Drive sharing policy blocks accounts outside your domain.
- **"The service account cannot create files in this folder"** — it is a member, but with too weak a role. Change its role to **Content Manager**; **Viewer** and **Commenter** cannot create files.
- **"The folder must be located in a Shared Drive"** — a service account has no My Drive storage of its own, so a file it creates in a My Drive folder would be owned by nobody and invisible to your team. Move the folder to a Shared Drive, or use OAuth instead.

> **Note:** Adding the service account through a **sharing link** is not enough — it must be an explicit member of the Shared Drive, with its full `...iam.gserviceaccount.com` address.

---

## Working with Imported Data

OWOX Data Marts owns only the columns it writes — the **imported range** —
and treats the rest of your sheet as your space. This section describes what
survives a refresh, what changes, and how the sheet reacts to schema or
result-set changes.

### What gets overwritten on every refresh

The **imported rectangle** — every cell from row 1 down to the last data
row, across columns that came from the data mart — is fully owned by OWOX
and rewritten from scratch on each refresh. Practical consequences:

- **Headers in row 1 are rewritten** to the latest column names (or their
  aliases). Manual edits to header cells inside the imported columns will
  not persist.
- **Data cells inside imported columns are replaced** by the values from
  the latest run. If you type a note or a formula directly into one of the
  imported columns, it disappears on the next refresh — even when SQL
  returns `NULL` for that cell. To keep your own content alongside the
  data, place it in columns **to the right** of the imported range
  (see [What survives a refresh](#what-survives-a-refresh) below).
- **Cells in the imported columns below the last data row are cleared.**
  When a refresh produces fewer rows than the previous one — for example,
  after you apply a row limit or a filter — the leftover rows from the
  earlier run are wiped, so the user never sees stale numbers under fresh
  ones.

### What survives a refresh

- **Cells and formulas to the right of the imported range** — currency
  conversions, `VLOOKUP` enrichments, summary cells, and any other content
  placed in columns past the last imported one are kept intact across
  refreshes.
- **Auto fill-down for row-2 formulas.** A formula placed in row 2 of any
  user column to the right of the imported range is automatically extended
  down to every data row on the next refresh. Relative cell references are
  shifted the same way Google Sheets shifts them when you drag the
  fill-handle. This is enabled by default — no settings to configure.
- **Static values in user columns are not overwritten by fill-down.** Auto
  fill-down only acts on columns where row 2 actually holds a formula. If
  row 2 of a column to the right of the imported range is empty or holds a
  static value, that column is skipped entirely — so lookup tables, notes,
  or any other static content placed in those columns survives untouched.
- **Your column ordering.** If you rearrange columns in row 1 by dragging
  headers in Google Sheets, OWOX remembers the new order on the next
  refresh and writes data rows in your layout. Re-ordering columns in the
  SQL source **after the first run** does not override your layout — your
  row 1 wins.
- **Pivot tables, charts, and named ranges** that reference the imported
  range keep working. OWOX uses Sheets' native column insert and delete
  operations, so dependent ranges, charts and pivot sources are updated
  automatically — the same as when you manually insert or delete a column.
- **Output Schema aliases.** When you set a display alias for a column in
  the data mart, the alias appears in row 1 of the destination sheet
  without inserting or deleting any columns and without touching your other
  content.

### How schema and result-set changes are reflected

- **A new SQL column** is appended at the right edge of the imported range.
  Any user content in columns to the right shifts right by one. The new
  column starts empty until OWOX fills it with values from the SQL — it
  does not inherit any formulas or formatting from the column to its left.
- **A removed SQL column** is deleted from the imported range. User
  formulas that referenced the removed column become `#REF!` — an honest
  signal that the column they depended on is gone.
- **Renaming a column in SQL** is treated as removing the old column and
  adding a new one. Formulas that pointed at the old name become `#REF!`
  and need to be repointed to the new column.
- **A smaller result set** (for example, when you set a Report row limit or
  apply filters that drop rows) only shows the rows produced by the latest
  run. Rows from a previous, larger refresh are cleared from the imported
  columns; user content in cells to the right of the imported range is left
  untouched.

> **Note:** OWOX matches columns by their SQL **name**, not by position.
> Display aliases are presentation-only and do not affect this matching.

### When a refresh fails

If a refresh fails before any data is delivered — for example, a warehouse
connection error or a SQL error caught at execution — the destination sheet
is left exactly as it was before the run. No headers are rewritten, no rows
are cleared, and your last successful refresh stays visible until the next
successful run replaces it.

### Per-column header notes

Each imported column header carries a note (hover the cell in Google Sheets
to view it). The note begins with the column's Output Schema description (if
one is set) followed by a provenance block: the data mart name, a link to
it in OWOX Data Marts, and the timestamp of the latest refresh. Use these
notes to confirm the source and freshness of any column at a glance.
