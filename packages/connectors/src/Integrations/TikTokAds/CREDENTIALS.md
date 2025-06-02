# TikTok Ads Connector Authentication Guide

To use the TikTok Ads connector, you need to obtain an access token from the TikTok Business API. This guide will walk you through the process.

## Prerequisites

1. You must have a TikTok For Business account
2. You must have Advertiser access to the account(s) you want to pull data from
3. You must have developer access to create an app

## Steps to Obtain Credentials

### 1. Create a Developer App

1. Go to the [TikTok for Business Developers](https://business-api.tiktok.com/portal) portal
2. Log in with your TikTok for Business account credentials
3. Press "Become a Developer"
4. Fill in the required information:
   - First Name
   - Last Name
   - Communication Email
   - Type of your company
5. Press "Next" and complete the application

![TikTok Become a Developer](res/tiktok_developer.png)

### 2. Configure the App

1. Go to ["My Apps"](https://business-api.tiktok.com/portal/apps) and press "Create an App"
2. Fill in the required information:
   - App name
   - App description
   - Advertiser redirect URL (this can be a placeholder like `http://localhost:8080` if you're just generating a token)
3. Chose access to the following scopes of permission:
   - Read Ad Account Information
   - Read Campaigns
   - Read Ad Groups
   - Read Ads
   - Read Custom Audiences
4. Press "Submit"

![TikTok Create App](res/tiktok_createapp.png)

### 3. Generate an Access Token

1. Copy Advertiser authorization URL and open the URL in your browser.

![TikTok URL](res/tiktok_url.png)

2. After authentication, you'll see the link with the `auth_code`.
3. Exchange this code for an access token by making a POST request to:
   ```
   https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/
   ```
   with the following parameters:
   - `app_id`: Your app ID
   - `auth_code`: The code from the redirect
   - `secret`: Your app secret

## Getting Advertiser IDs

1. Once you have an access token, you can use the following endpoint to get a list of advertisers accessible to your account:
   ```
   https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/
   ```
2. Make a GET request to this endpoint with your access token in the "Access-Token" header
3. The response will include a list of advertiser IDs that you can use in the connector

## Token Validity and Refreshing

- TikTok access tokens are valid for 24 hours
- For production use, implement a token refresh process using the refresh token
- For regular use of this connector, it's recommended to regenerate a new token daily before running your imports

## Security Considerations

- Store your access token securely
- Do not share your app secret or access tokens
- Consider implementing token refresh logic for production environments 