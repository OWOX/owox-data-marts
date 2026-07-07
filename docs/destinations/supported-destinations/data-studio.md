# Data Studio

Data Studio helps you build interactive dashboards and reports.
Add it as a **Destination** to access and visualize your OWOX Data Marts data.

Watch the walkthrough below for the full setup. It covers creating the destination, sharing a Data Mart, and connecting Data Studio.

<https://github.com/user-attachments/assets/95e499eb-0a36-4180-846b-a829294e1afe>

## Prerequisites

Before you set up a Data Studio destination:

- An existing **Published** Data Mart.
- Access to **Data Studio** with a Google Account.
- A project role that can create **Destinations**. Project Admins and Technical Users can create Destinations; Business Users can create and manage Destinations they own. See [Roles and Permissions](../../project/roles-and-permissions.md).
- Access to **use** the published Data Mart and the selected Data Studio Destination. To edit the Data Studio report later, you also need report access through Data Mart maintenance access or report ownership. See [Ownership and Sharing](../../project/ownership-and-sharing.md).

## Step 1. Create a Destination entity

> **Self-hosted?** Confirm your Deployment URL (public origin) is correct **before** copying the JSON Config — the URL is embedded in it. See [Troubleshooting](#troubleshooting).

- In the OWOX Data Marts web app, open **Destinations** from the navigation pane. Click **+ New Destination**.
- Select **Data Studio** from the **Destination Type** dropdown.
- Provide a **Title** — a unique name for this Destination (e.g., "Data Studio Access (Marketing Team)").
- Click **Save**.
- Open the destination you just created. You'll see the JSON Config ready to copy.
- Click the **copy icon** on the **JSON Config** field. You'll paste it into Data Studio in Step 3.

> **⚠️ Note**: The JSON Config contains a secret key — keep it private. If it's exposed, use [**Rotate Secret Key**](../manage-destinations.md#rotating-a-data-studio-destination-secret-key) on the destination, then update the Data Studio connector with the new JSON Config.

![OWOX Data Marts new destination form with "Data Studio" selected as destination type, showing Title and Deployment URL fields and a JSON Config ready to copy](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/8845eaa6-6a31-4bce-cc8c-e29b52d68600/public)

---

## Step 2. Make a Data Mart accessible for Data Studio

- Open the **Data Mart** you want to share with Data Studio. Go to its **Destinations** tab.
- Find the Data Studio Destination row. Click its toggle to make the Data Mart available in Data Studio.

![Data Mart Destinations tab with a Data Studio destination row expanded. The "Available in Data Studio" toggle is switched on, and the status reads "Waiting for Data Studio to fetch data".](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/0758c088-0ddc-4da7-1b1d-5e7823c33800/public)

- Click the row to adjust the **Cache Lifetime**. The default is **5 minutes**. Available options are **5, 10, 15, or 30 minutes**, and **1, 2, 4, 8, or 12 hours**.
  - Within this period, OWOX serves results from the storage cache. It does not re-run the query.

Use **Report Columns** to select which fields to include in the Data Studio report. Native fields appear for every Data Mart; joined fields also appear when the Data Mart uses [Joinable Data Marts](../../getting-started/setup-guide/joinable-data-marts.md). Click **Save changes** after editing Cache Lifetime or Report Columns.

![Data Studio Destination configuration panel showing the Cache Lifetime setting and a Report Columns list with checkboxes for native and joined fields included in the report](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/f7194b81-6f4a-4408-ae38-ab8ee529ac00/public)

---

## Step 3. Add a Data Source in Data Studio

- Find the [OWOX Data Marts connector](https://datastudio.google.com/datasources/create?connectorId=AKfycbz6kcYn3qGuG0jVNFjcDnkXvVDiz4hewKdAFjOm-_d4VkKVcBidPjqZO991AvGL3FtM4A) in Data Studio's Gallery.
- **Authorize** with your Google Account. Data Studio needs this to connect to your data.
- Provide a **Configuration Display Name** — a unique name to help you distinguish different connections (e.g., "Data Studio Access (Marketing)").
- Paste the value from your clipboard into the **JSON Config** field and click **Next**.

![Looker Studio connector setup screen for OWOX Data Marts with Configuration Display Name and JSON Config fields, and a Next button](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/b688d2af-aa08-4a61-c093-a36685380c00/public)

- Select the **Connection Configuration** saved from the **Configuration Display Name** and **JSON Config** step, then click **Next**.
- Select a **Data Mart** and click **Connect**.

![Looker Studio connector screen with Select Connection Configuration and Select the Data Mart dropdowns, and the Connect button highlighted](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/dc480093-23fe-4753-4313-4a4a5c7a1400/public)

- Review the field list Looker Studio shows for this data source. If a field is missing, see the note below.
  - Set field names and descriptions in the Data Mart's **Output Schema** in the OWOX Data Marts web app.

When the fields look correct, click **Create report**, then **Add data** to your report. Build the report by selecting the fields you want.

![OWOX Data Marts data source field list in Looker Studio with the Create Report button highlighted](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/a1645014-1ff6-43df-db94-a0e3d6a73100/public)

> **⚠️ Note**: Missing fields in Data Studio? See [How do I update fields after changing Output Schema or Report Columns?](#how-do-i-update-fields-after-changing-output-schema-or-report-columns).

---

## Q&A

### How does data stay updated in Data Studio?

Data Studio requests data through OWOX. If a valid cache entry exists, OWOX serves cached results; on a cache miss or after the configured **Cache Lifetime** expires, OWOX reads from the Data Mart's underlying data source again. Data freshness depends on both the underlying data source and the configured Cache Lifetime. Clicking **Refresh data** asks Data Studio to request data again, but OWOX may still return cached results until the Cache Lifetime expires.

Open the Data Mart in the OWOX Data Marts web app to see when Data Studio last fetched this report. The Destination configuration shows the last fetch:

![Data Mart Destinations tab showing the Data Studio Destination toggle enabled with status "Last fetched successfully 2 minutes ago"](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/ce0247fe-8edd-4582-25cc-26aa662ecf00/public)

Or check the Run History:

![Data Mart Run History tab showing a report run entry with a Success status and its configuration details](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/353dfd6c-edbf-4f17-27b3-a0aff0966d00/public)

To ask Data Studio to request data again, click **Refresh data** in the Data Studio report. OWOX may still return cached results until the Cache Lifetime expires.

![Looker Studio report options menu with the Refresh data option highlighted](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/fbb5547b-45be-4f5b-6737-f4c236a11500/public)

### How do I update fields after changing Output Schema or Report Columns?

After changing the Data Mart's **Output Schema** or the Data Studio report's **Report Columns** in OWOX, open the data source editor in Data Studio and click **Refresh fields** or **Reconnect** so Data Studio picks up the updated schema.

For joined fields, first confirm they are selected in the Data Studio report's **Report Columns** configuration. Go back to [Step 2. Make a Data Mart accessible for Data Studio](#step-2-make-a-data-mart-accessible-for-data-studio) to enable or disable fields.

![Looker Studio data source editor showing the OWOX Data Marts field list with the Refresh fields button highlighted](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/7e1bbb9e-ba05-4ba7-27cf-52d1d9b17e00/public)

### How do I delete an OWOX connection in Data Studio?

In Data Studio, remove the data source that uses the OWOX Data Marts connector: open the report, go to **Resource** → **Manage added data sources**, find the OWOX data source, and click **Remove**. If you created a reusable data source, remove it from the **Data Sources** page in Data Studio, then delete it from **Trash** if you need to remove it permanently. See Google's guide to [delete a data source](https://docs.cloud.google.com/data-studio/delete-a-data-source).

Removing a data source only removes that Data Studio asset. If your goal is to revoke access from the OWOX side, use [**Rotate Secret Key**](../manage-destinations.md#rotating-a-data-studio-destination-secret-key) or delete the Data Studio Destination in OWOX. Existing Data Studio data sources that use the old JSON Config will stop working until they are updated with a valid JSON Config.

### Can I use several OWOX connections?

Yes. Create a separate **Connection Configuration** for each OWOX Destination, project, or instance you want to use. To add another connection, open the OWOX Data Marts connector again, paste the JSON Config for that Destination, and give it a unique **Configuration Display Name** so you can recognize it later.

For several Data Marts exposed through the same OWOX Data Studio Destination, reuse the same **Connection Configuration** and choose a different **Data Mart** when creating another Data Studio data source.

![Data Studio connector Select Connection Configuration dropdown showing an existing OWOX Data Studio Connection and the Add New Connection Configuration option](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/9f19235f-92f7-4880-00d9-b1124e4bd700/public)

---

## Troubleshooting

| Symptom | First action |
| --- | --- |
| Connection fails right after pasting the JSON Config | Re-copy the **JSON Config** from the destination in Step 1 and paste it again — the value may be incomplete or outdated. |
| Authorization error or the connector can't reach your instance | Re-authorize with your Google Account and confirm the **Deployment URL** matches your OWOX instance. |
| Self-hosted connector requests fail or time out | Confirm the Deployment URL uses the public HTTPS origin from `PUBLIC_ORIGIN` or `LOOKER_STUDIO_DESTINATION_ORIGIN`. If you run OWOX yourself, update these environment variables; if someone else manages the deployment, ask them to update them. Also confirm that your proxy/auth layer lets `/api/external/looker/*` requests reach OWOX Data Marts without an interactive login. |
| Data Mart dropdown is empty in Data Studio | Confirm the Data Mart is **Published**, the **Available in Data Studio** toggle is on, you pasted the correct **JSON Config**, and the destination's secret key was not rotated after you pasted it. |
| Toggle stays on **"Waiting for Data Studio to fetch data"** | Open a report on this data source (or click **Refresh data**) to trigger a fetch, then re-check the status. |
| A run shows a non-**Success** status | Open the **Run History** tab on the Data Mart and inspect the failed run's details. Check for warehouse/query errors, storage credential issues, row or size limits, and project credit or access restrictions. |
| Data Studio is slow, times out, or returns a row/size limit error | Each request must stay within the Data Studio connector [`getData()` limit](https://developers.google.com/looker-studio/connector/reference#getdata) of **1,000,000 rows** and the Apps Script [URL Fetch response size limit](https://developers.google.com/apps-script/guides/services/quotas) of **50 MB per call**. In OWOX, use the Data Studio report's **Report Columns** and [output controls](../../getting-started/setup-guide/output-controls.md) to select fewer columns, add filters, set a limit, or aggregate the data before using the data source. |
| Expected fields are missing in Data Studio | See [How do I update fields after changing Output Schema or Report Columns?](#how-do-i-update-fields-after-changing-output-schema-or-report-columns). |

Need more help? Ask the [OWOX Community](https://github.com/OWOX/owox-data-marts/discussions).
