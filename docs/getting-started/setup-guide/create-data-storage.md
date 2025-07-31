# Create a Data Storage

Before creating any Data Mart, you need to connect your data storage — a cloud data warehouse where your data will be stored and processed.

Currently, OWOX Data Marts support:

- [Google BigQuery](docs/storages/supported-storages/google-bigquery.md)  
- [Amazon Athena](docs/storages/supported-storages/aws-athena.md)

More options coming soon: 🛠️ Snowflake, Redshift, Databricks, and Azure Synapse

## Step 1: Go to Storage Setup

In OWOX Data Marts, navigate to the **Storages** section in the left sidebar and click on **+ New Storage**.

![Storage screenshot](../res/screens/Storage-1.png)

## Step 2: Add a New Storage

Then select the data warehouse you want to add and follow the instructions for your platform.

![Select Your Storage - Step 2](../res/screens/Storage-2.png)

### Option 1: Google BigQuery

#### Title

Give the storage a clear title, eg `OWOX Data Marts – Your Name`.

#### Enable BigQuery API

- Open the [BigQuery API Library page](https://console.cloud.google.com/apis/library/bigquery.googleapis.com)
- Ensure the correct Google Cloud project is selected
- If the API isn’t enabled, click **Enable**
- If already enabled, you’ll see the API dashboard

#### Enter Project ID

- Go to the [Google Cloud Console](https://console.cloud.google.com/)
- Click the project selector dropdown at the top
- Find your project and copy the **Project ID**

#### Select location

- Choose a data location (e.g., `US`, `EU`) from the dropdown menu

![Select Your Storage - Step 3](../res/screens/Storage-3.png)

#### Add a Service Account

To get the JSON key, you'll need to create or use an existing service account in Google Cloud.

> ✅ **Best Practice:** Always use a dedicated service account with least-privilege access for security and auditability.

**Steps:**

- Go to the [Service Accounts page](https://console.cloud.google.com/iam-admin/serviceaccounts)
- Navigate to **IAM & Admin → Service Accounts**
- Create a new account or choose an existing one
- Assign the roles:
  - `BigQuery Data Editor`
  - `BigQuery Job User`
- Go to the **Keys** tab, click **Add key → Create new key**
- Choose **JSON**, click **Create**, and download the file
- Copy the contents of the JSON file and paste it into the **Service Account JSON** field

![BigQuery Service Account Setup](../res/screens/Storage-4.png)

Click **Save** to complete setup.

### Option 2: Amazon Athena

#### Title

Give your storage a title, e.g. `OWOX Data Marts – Your Name`.

![Athena Setup](../res/screens/Storage-5.png)

#### Add region

- Open the [AWS Athena Console](https://console.aws.amazon.com/athena/)
- Find the current region in the top-right region selector
- Make sure you enter **exactly the same region** in the setup form

> ⚠️ If the region doesn’t match, the connection will fail.

#### Set output bucket

To define the output location for Athena query results:

- Open the **AWS S3 Console**
- Use an existing bucket or create a new one (in the same region as Athena)
- Enter the bucket name in the form

#### Add AWS Access Keys

- Go to [IAM Users](https://console.aws.amazon.com/iam/home#/users) or [IAM Roles](https://console.aws.amazon.com/iam/home#/roles)
- Choose an existing user/role or create a new one
- In the **Permissions** tab, attach these policies:
  - `AmazonAthenaFullAccess`
  - `AWSGlueFullAccess`
  - `AmazonS3FullAccess`

To generate access keys:

- Go to [AWS IAM Security Credentials](https://console.aws.amazon.com/iam/home#/security_credentials)
- Under **Access keys**, find existing or create new keys
- Download and securely store the **Access Key ID** and **Secret Access Key**
- Enter them in the OWOX form

Click **Save** to complete setup.

## Best practices

- Use a **dedicated service account or IAM user** for OWOX Data Marts
- Avoid using personal credentials for automation
- If managing multiple clients or teams, **create separate storage configurations** to isolate access

## Related Pages

- [What is a Data Mart in OWOX →](what-is-data-mart.md)
- [Create Connector-Based Data Mart →](create-connector-data-mart.md)
- [Create SQL-Based Data Mart →](create-sql-data-mart.md)
- [Scheduling Triggers →](connector-triggers.md)
- [Scheduling Triggers →](report-triggers.md)
- [Adding a Report Destination →](create-a-destination.md)
