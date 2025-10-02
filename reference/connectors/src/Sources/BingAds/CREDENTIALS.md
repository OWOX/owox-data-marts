# How to obtain the credentials for the Bing Ads source

During this process, you will obtain the following credentials required for the Bing Ads source:

- **Account ID**  
- **Customer ID**  
- **Developer Token**  
- **Client ID**  
- **Client Secret**  
- **Refresh Token**

## Step 1: Register an App in Microsoft Azure

If you haven't already, [sign up for Microsoft Azure](https://azure.microsoft.com/) and log in to the [Azure Portal](https://portal.azure.com/).

In the Azure Portal, search for and open the **App registrations** service.

![Bing Search App](res/bing_appsearch.png)

Click **New registration** and fill in the form:

- **Name**: Choose a name for your app.  
- **Supported account types**:  
  Select:  
  _Accounts in any organizational directory (Any Microsoft Entra ID tenant – Multitenant) and personal Microsoft accounts (e.g., Skype, Xbox)_
- **Redirect URI**:  
  - Platform: _Web_  
  - URI: `http://localhost:8080`
  
Click the **Register** button.

![Bing New App](res/bing_newapp.png)

## Step 2: Generate Client Credentials

In your registered app, go to **Client credentials** -> **Add a certificate or secret**.

![Bing Create Secret](res/bing_createsecret.png)

Click **New client secret**.

Provide a description (e.g., _Client secret for OWOX App_), choose the maximum expiration period (_730 days_), and click **Add**.

![Bing New Secret](res/bing_newsecret.png)

> ⚠️ **Important:** Copy and securely save the **client secret value**. You won't be able to see it again later.

![Bing Copy Secret](res/bing_copysecret.png)

At this point, you have:

- **Client ID**
- **Client Secret**
- **Redirect URI**: `http://localhost:8080`

## Step 3: Get Account ID and Customer ID

1. Go to [https://ads.microsoft.com/](https://ads.microsoft.com/) and log in to your Bing Ads account.  
2. Your **Account ID** and **Customer ID** can be found in the URL.

![Bing Add Account](res/bing_addaccount.png)

## Step 4: Get Your Developer Token

In the Bing Ads interface, go to **Settings → Developer Settings**.  

![Bing Developer](res/bing_developer.png)

Click **Request Token**, and copy the generated **Developer Token**.  

![Bing Request](res/bing_request.png)

## Step 5: Generate an Authorization Code

Great! Create a URL by replacing `CLIENTID` with your **Client ID**:
`https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=CLIENTID&response_type=code&redirect_uri=http://localhost:8080&scope=https://ads.microsoft.com/msads.manage offline_access`

Open the URL in your browser. Log in and authorize the app by clicking **Accept**. After authorization, you will be redirected to:  
`http://localhost:8080/?code=YOUR_CODE`  

Copy the `code` value from the URL.

> Example:  
> If the redirect URL is:  
> `http://localhost:8080/?code=M.C519_BAY.2.U.0a895e39-774a-e677-b4bb-8589ce3e0beb`  
>Your **Authorization Code** is:  
>`M.C519_BAY.2.U.0a895e39-774a-e677-b4bb-8589ce3e0beb`

## Step 6: Exchange Authorization Code for a Refresh Token

Exchange this code for a refresh token by making a GET request to
`https://login.microsoftonline.com/common/oauth2/v2.0/token`
with the following parameters (as form data or in the body of the request):

- `client_id` = `YOUR_CLIENT_ID`  
- `client_secret` = `YOUR_CLIENT_SECRET`  
- `grant_type` = `authorization_code`  
- `code` = `YOUR_AUTHORIZATION_CODE`  
- `redirect_uri` = `http://localhost:8080`  
- `scope` = `https://ads.microsoft.com/msads.manage offline_access`

![Bing GET Request](res/bing_getrequest.png)

After a successful request, you will receive a **Refresh Token** in the response. Store it securely — this token will be used to authenticate API requests.

![Bing Refresh](res/bing_refresh.png)

## ✅ Final Summary

At this point, you should have the following credentials:

- **Account ID**  
- **Customer ID**  
- **Developer Token**  
- **Client ID**  
- **Client Secret**  
- **Refresh Token**

These credentials are required to connect to the Bing Ads source and begin importing your advertising data.
