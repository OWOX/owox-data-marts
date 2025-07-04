# How to obtain the access token for the Facebook Ads source

To connect to the Facebook Ads API and begin importing data into Google Sheets or BigQuery, follow the steps below.

## Step 1: Sign In to the Meta for Developers Portal

Visit the [Meta for Developers](https://developers.facebook.com/) site and log in with your Facebook account.

![Facebook login portal](res/facebook_login_portal.png)

![Facebook login page](res/facebook_login.png)

## Step 2: Create a New App

Navigate to **My Apps** and click the **Create App** button.

![Facebook My apps](res/facebook_myapps.png)

![Facebook creating app](res/facebook_createapp.png)

Enter the **App Name** in the provided field.

![Facebook app name](res/facebook_appname.png)

Select **Other** as the use case.  

![Facebook Other use case](res/facebook_other.png)

Select **Business** as the app type and click **Next**.  

![Facebook Business app type](res/facebook_business.png)

Choose the appropriate **Business Portfolio**, then click the **Create App** button.  

![Facebook Business portfolio option](res/facebook_portfolio.png)

## Step 3: Complete Business Verification

Navigate to **App Settings → Basic**, and initiate the **Business Verification** process.

![Facebook Business Verification](res/facebook_verification.png)

If prompted, connect your app to a business portfolio.

![Facebook Connect](res/facebook_connect.png)

Click **Start Business Verification**.  

![Facebook Start Verification](res/facebook_start_verification.png)

On the next page, locate the **Business Verification** section and click the button to proceed with the verification process.  

![Facebook Portfolio Verification](res/facebook_portver.png)

Fill in the form with accurate **contact** and **organizational** information about your business.

> 📌 Make sure your submission meets [Meta's verification requirements](https://business.facebook.com/business/help/159334372093366).

After submitting the form, the review process may take up to **2 business days**.  

![Facebook Submitted](res/facebook_submitted.png)

## Step 4: Set Up Marketing API

Once your business is successfully verified, return to the [Developers Portal](https://developers.facebook.com/).  
In your app dashboard, locate **Marketing API** and click **Set Up**.  

![Facebook Marketing API set up](res/facebook_setup.png)

## Step 5: Grant API Permissions

Grant the required token permissions:

- `ads_read`  
- `read_insights`  

   These permissions authorize your app to access advertising data from your Facebook account.  

![Facebook permissions granting](res/facebook_checkbox.png)

## Step 6: Generate and Save the Access Token

Click the **Get Token** button.

![Facebook getting token](res/facebook_gettoken.png)

Copy and securely save the generated access token.  
    If needed, you can regenerate it later by navigating to **Marketing API > Tools**.

![Facebook saving token](res/facebook_token.png)

## Step 7: Use the Access Token

Once you have the access token, you can use it as described in the [Getting Started guide](GETTING_STARTED.md).

## Troubleshooting and Support

If you encounter any issues:

1. Check the "Logs" sheet for specific error messages
2. Please [visit Q&A](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a) first
3. If you want to report a bug, please [open an issue](https://github.com/OWOX/owox-data-marts/issues)
4. Join the [discussion forum](https://github.com/OWOX/owox-data-marts/discussions) to ask questions or propose improvements
