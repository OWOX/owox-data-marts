# How to Obtain the Access Token for the Google Ads Source

To connect to the **Google Ads API** and start importing data with OWOX Data Marts, follow the steps below.

## Step 1: Create a Service Account in Google Cloud Platform (GCP)

1. Open your GCP project and navigate to  
   **IAM & Admin → Service Accounts → Create Service Account**.  
2. Enter a **name** and **description**, then click **Create and Continue**.  
3. Assign the following roles:  
   - **BigQuery User**  
   - **BigQuery Data Editor**  
4. Click **Continue**, then **Done**.  
5. Locate the newly created service account, click the **three dots** (⋮) on the right-hand side, and select **Manage Keys**.  
6. In the **Keys** tab, click **Add Key → Create New Key → JSON**.  
7. The JSON key file will be downloaded automatically — please **store it securely**, as you will need it later.  

![Google Ads Add service account keys](res/googleads_service.png)

## Step 2: Set Up Access in Google Ads

**Prerequisites**:

You must have a **Manager (MCC)** account in Google Ads.  
If you don’t have one yet, follow Google’s instructions to create it:  
👉 [Create a Manager Account](https://support.google.com/google-ads/answer/7459399?hl=en)

**Add the Service Account to Google Ads**:

1. Open your **Google Ads account** and go to **Admin → Access and Security**.  
2. Click the **+ (plus)** button to add a new user.  
3. Paste your **service account email address**.  
4. Assign **Read-only** permissions.  
5. Click **Add account**

![Google Ads Add service account email](res/googleads_addservice.png)

## Step 3: Register in the API Center

1. In the same **Admin** section of Google Ads, open **API Center**.  
2. Fill in the required form fields:  
   - **API Contact Email**  
   - **Company Name**  
   - **Company URL**  
   - **Company Type**  
   - **Intended Use** — e.g., “For in-house marketing analytics and retrieving ad data for reporting.”  
   - **Principal Place of Business**  
3. Accept the Terms and Conditions checkbox.  
4. Click **Create Token**.

![Google Ads Request API](res/googleads_apirequest.png)

## Step 4: Save Your Developer Token and Customer ID

After completing the registration:

- Copy and securely save your **Developer Token**.  
- Copy your **Customer ID** (from the top of your Google Ads account).  

![Google Ads Developer Token](res/googleads_devtoken.png)

At this point, you should have the following credentials:

| Credential | Description |
|-------------|-------------|
| **Service Account Key (JSON)** | Used for authentication from your GCP project |
| **Developer Token** | Authorizes access to the Google Ads API |
| **Customer ID** | Identifies your specific Google Ads account |

## Step 5: Use the Credentials to Obtain the Access Token

Use the credentials you gathered above to retrieve the access token and connect to Google Ads, as described in the  
👉 [GETTING_STARTED](GETTING_STARTED.md) guide.

✅ **You’re all set!**  
You can now use your service account, developer token, and customer ID to access and import data from Google Ads via OWOX Data Marts.
