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

#### 2. Create a Service Account and JSON Key

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
