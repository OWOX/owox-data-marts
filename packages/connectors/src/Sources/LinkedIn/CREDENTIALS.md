## How to obtain the Access Token for Linkedin Ads and Linkedin Pages Sources

1. Visit the [LinkedIn Developer portal](https://developer.linkedin.com/ ).

2. Click the **Create App** button.

![LinkedIn creating app](res/linkedin_createapp.png)

3. Enter your **App Name** and paste the link to your company's LinkedIn page into the **LinkedIn Page** field.  

 ![LinkedIn app name](res/linkedin_appname.png)

4. Upload your app logo, check the box to accept the legal agreement, and click the **Create App** button.  

 ![LinkedIn app creating](res/linkedin_create.png)

5. Go to the **Settings** tab and click the **Verify** button. The administrator of your LinkedIn company page must then verify the app to grant it access to company data.  

 ![LinkedIn app verifying](res/linkedin_verify.png)

6. Once the app is verified, go to the **Products** tab and request access to the **Advertising API**.  

 ![LinkedIn app request](res/linkedin_request.png)

   Approval can take up to 24 hours. You will receive an email when your request is approved:  

 ![LinkedIn request accepted](res/linkedin_accepted.png)

7. When access is granted, the **Advertising API** will appear under the **Added Products** section on the Products page:  

 ![LinkedIn Adv API added](res/linkedin_addedapi.png)

8. Navigate to the **Auth** tab and click on **OAuth 2.0 tools** on the right-hand side of the page:  

 ![LinkedIn OAuth](res/linkedin_oauth.png)

9. Click the **Create token** button:

 ![LinkedIn Token](res/linkedin_createtoken.png)

10. In the new window:

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

11. On the next screen, click **Allow** to grant access.

 ![LinkedIn Allow access](res/linkedin_allow.png)

12. Copy the generated **Access Token**.

 ![LinkedIn Copy token](res/linkedin_copytoken.png)

Once you have the access token, you can use it as described in the [Getting Started guide](GETTING_STARTED.md).


