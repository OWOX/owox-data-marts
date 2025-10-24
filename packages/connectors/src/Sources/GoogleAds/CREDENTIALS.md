# How to Obtain the Access Token for the Google Ads Source

To connect to the **Google Ads API** and start importing data with OWOX Data Marts, follow the steps below.

**Prerequisites**:

You must have a **Manager (MCC)** account in Google Ads.  
If you don’t have one yet, follow Google’s instructions to create it:  
[Create a Manager Account](https://support.google.com/google-ads/answer/7459399?hl=en)

## Step 1. Register in the API Center

1. In your **Manager (MCC)** account, open **Admin → API Center**.  
2. Fill out the registration form with the following details:  
   - **API Contact Email**  
   - **Company Name**  
   - **Company URL**  
   - **Company Type**  
   - **Intended Use** — for example:  
     _“For in-house marketing analytics and retrieving ad data for reporting.”_  
   - **Principal Place of Business**  
3. Check the box to accept the Terms and Conditions.  
4. Click **Create Token**.

![Google Ads Request API](res/googleads_apirequest.png)

## Step 2. Request Basic Access for the Developer Token

By default, new developer tokens can only access **test accounts**.  
To retrieve data from active Google Ads accounts, you must apply for **Basic Access**.

![Google Ads Basic Access](res/googleads_applyforbasicaccess.png)

In the Basic Access application form:

1. Fill in your company details.  
2. Describe your company’s business model and how you use Google Ads.  
   Example:  
   _“We leverage Google Ads to execute targeted campaigns that increase customer acquisition and brand awareness.”_  
3. Attach a document or PDF with a sample of your planned report design.  
4. For the question _“Do you plan to use your Google Ads API token with a tool developed by someone else?”_, select **Yes** and include the OWOX Data Marts URL:  
   [https://github.com/OWOX/owox-data-marts](https://github.com/OWOX/owox-data-marts)  
5. For the question _“Do you plan to use your token for App Conversion Tracking and Remarketing API?”_, select **No**.  
6. Under _“Which of the following Google Ads capabilities does your tool provide?”_, check at least **Campaign Management** and **Reporting**.  
7. Submit the application.

![Google Ads Request Form](res/googleads_requestform.png)

Within approximately **three business days**, the Google Ads team will respond to your registered email address.  
If approved, you’ll see your access level updated in the API Center:  

![Google Ads Basic Access](res/googleads_basicaccess.png)

## Service Account Authentication

### Step 1: Create a Service Account in Google Cloud Platform (GCP)

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

### Step 2: Set Up Access in Google Ads

**Add the Service Account to Google Ads**:

1. Open your **Google Ads account** and go to **Admin → Access and Security**.  
2. Click the **+ (plus)** icon to add a new user.  
3. Paste your **service account email address**.  
4. Assign **Read-only** permissions.  
5. Click **Add Account**.  
6. Repeat the same steps for your **Manager (MCC)** account.

![Google Ads Add service account email](res/googleads_addservice.png)

## Step 4: Save Your Developer Token and Customer ID

After completing, make sure to collect and securely store the following information:

- **Developer Token** — copy it from the **API Center** in your **Manager (MCC)** account.  
- **Customer ID** — copy it from the top-right corner of your **ad account** (the account from which you want to retrieve data).  
- **Login Customer ID** — copy the ID of your **Manager (MCC)** account.  

![Google Ads Developer Token](res/googleads_devtoken.png)

At this point, you should have the following credentials:

| Credential | Description |
|-------------|-------------|
| **Service Account Key (JSON)** | Used for authentication from your GCP project |
| **Developer Token** | Authorizes access to the Google Ads API |
| **Customer ID** | Identifies the ad account you’re retrieving data from |
| **Login Customer ID** | Identifies your Manager (MCC) account used for authentication |

## Step 5: Use the Credentials to Obtain the Access Token

Use the credentials you gathered above to retrieve the access token and connect to Google Ads, as described in the  
👉 [GETTING_STARTED](GETTING_STARTED.md) guide.

## OAuth2 Authentication

> This section is currently under development.  
> OAuth2 authentication will allow connection using individual user consent instead of a service account.

✅ **You’re all set!**  
You can now use your service account, developer token, and customer ID to access and import data from Google Ads via OWOX Data Marts.
