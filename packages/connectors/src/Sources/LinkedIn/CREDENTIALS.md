# How to obtain the Access Token for Linkedin Ads and Linkedin Pages Sources

To connect to LinkedIn Ads and Pages through the API, you need to create an app, request access to the Advertising API, and generate an access token. Follow the steps below to complete the process.

## Step 1: Create a LinkedIn App

Visit the [LinkedIn Developer portal](https://developer.linkedin.com/ ).

Click the **Create App** button.

![LinkedIn creating app](res/linkedin_createapp.png)

Enter your **App Name** and paste the link to your company's LinkedIn page into the **LinkedIn Page** field.  

 ![LinkedIn app name](res/linkedin_appname.png)

Upload your app logo, check the box to accept the legal agreement, and click the **Create App** button.  

 ![LinkedIn app creating](res/linkedin_create.png)

## Step 2: Verify the App

Go to the **Settings** tab and click the **Verify** button. The administrator of your LinkedIn company page must then verify the app to grant it access to company data.  

 ![LinkedIn app verifying](res/linkedin_verify.png)

## Step 3: Request Access to the Advertising API

Once the app is verified, go to the **Products** tab and request access to the **Advertising API**.  

 ![LinkedIn app request](res/linkedin_request.png)

Approval can take up to 24 hours. You will receive an email when your request is approved:  

 ![LinkedIn request accepted](res/linkedin_accepted.png)

When access is granted, the **Advertising API** will appear under the **Added Products** section on the Products page:  

 ![LinkedIn Adv API added](res/linkedin_addedapi.png)

## Step 4: Generate an Access Token

Navigate to the **Auth** tab and click on **OAuth 2.0 tools** on the right-hand side of the page:  

 ![LinkedIn OAuth](res/linkedin_oauth.png)

Click the **Create token** button:

 ![LinkedIn Token](res/linkedin_createtoken.png)

In the new window:

    > ⚠️ **Note:** If you see the error message  
    > _"There aren't any scopes available for this app. Select another app or visit your app's product settings to request API access,"_  
    > make sure you requested access to the **Advertising API** in Step 6 and that the request has been approved.  
    > ![LinkedIn Scopes Error](res/linkedin_error.png)

Select the following scopes:

    - `r_ads`
    - `r_ads_reporting`  

   ![LinkedIn Scopes](res/linkedin_scope.png)

Then, click **Request access token**.  

   ![LinkedIn Request token](res/linkedin_requesttoken.png)

On the next screen, click **Allow** to grant access.

 ![LinkedIn Allow access](res/linkedin_allow.png)

## Step 5: Save the Access Token

Copy the generated **Access Token**.

 ![LinkedIn Copy token](res/linkedin_copytoken.png)

## ✅ You’re Ready to Go

You can now use this token as described in the [Getting Started guide](GETTING_STARTED.md) to connect to LinkedIn Ads or LinkedIn Pages data sources.
