# Google BigQuery
Google BigQuery is a serverless, fully managed data warehouse designed for high-speed SQL queries on large datasets. Configure Google BigQuery as a Storage in OWOX Data Marts, to leverage its capabilities.

---

## Configuration Steps

### Google Cloud Console
#### 1. Get Google Cloud project ID
This is the ID of your Google Cloud project. BigQuery usage costs will be charged to this project.  
Here's how to find your billing project ID:  
1. Sign in to your Google account and open [Google Cloud Console](https://console.cloud.google.com/) 
2. Click the project picker button at the top of the page (it shows the current project name or "Select a project").
3. Find your project in the list. The **Project ID** is shown in the ID column.  
4. If you don't see your project, use the search box to find it by name or ID.

#### 2. Get Service Account JSON key
To get the JSON key, you'll need to create or use an existing service account in Google Cloud.  
Here's what to do:  
1. Open [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **IAM & Admin** → **Service Accounts**.
3. Create a new service account or select an existing one.
4. Assign the `bigquery.dataEditor` and `bigquery.jobUser` roles to this service account to allow read, write, and create access to your project resources.
5. Open the Service Accounts page, go to the **Keys** tab, click **Add key**, and select **Create new key**.
6. Choose **JSON** format and click **Create**.
7. Open the downloaded file, copy its entire content, and paste it into the field above.

#### 3. Enable the BigQuery API
To run queries and process data in Google BigQuery, you need to enable the [BigQuery API](https://console.cloud.google.com/apis/library/bigquery.googleapis.com) in your Google Cloud project.  
Follow the steps below to enable the API:
1. Open the [BigQuery API](https://console.cloud.google.com/apis/library/bigquery.googleapis.com) product details page and ensure the correct project is selected.
2. If the API isn't enabled yet, click **Enable**.
3. If it's already enabled, you'll see the API dashboard — that's fine.

#### 4. Find BigQuery dataset location
BigQuery data is stored in specific regions. To avoid query errors, your SQL queries must process data stored in the same location.  
Here's how to check your dataset location:  
1. Open [Google Cloud Console BigQuery page](https://console.cloud.google.com/bigquery).
2. In the left panel, expand your project and find your datasets.
3. Click each dataset name to open its details. The **Data location** field shows the region where that dataset is stored (for example, `US`, `EU`, `asia-northeast1`).
4. Make sure all your datasets are stored in the same location. If they are in different locations, select the location where most of your data is stored or create separate Storage for each location.
5. Put this location value in the field above.

---

### OWOX Data Marts
#### 1. Access the Storages Page
In the OWOX Data Marts web application, navigate to **Storages** from the main navigation pane and click **+ New Storage**.

#### 2. Choose Storage Type
Click **Google BigQuery** on the **New Storage** modal window appeared to create a new **Storage** configuration.  
> ☝️ Upon selecting the **+ New Storage** button and specifying the desired storage type, a Storage entry is created. You can create **Data Mart** entities and model a data structure for your project prior to configuring the **Storage**.  
> Note that **Data Mart** cannot be validated or published until the associated **Storage** is fully configured.

#### 3. Set General Settings and Connection Details
- **Title**: Provide a unique name for this Storage (e.g., "Analytics Warehouse").
- **Project ID**: Input your GCP Project ID, found in the GCP Console’s project dashboard.
- **Location**: Choose the dataset location from the dropdown, matching your BigQuery dataset’s region.
- **Service Account JSON**: Upload or paste the JSON key file from your Service Account.

#### 4. Finalize Setup
Review your entries and click **Save** to integrate the **Storage**, or **Cancel** to exit without saving the configuration.
