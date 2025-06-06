## How to obtain the access token for the Facebook Ads source

1. Visit the [Meta for Developers](https://developers.facebook.com/) site and log in with your Facebook account.

![Facebook login portal](res/facebook_login_portal.png)

![Facebook login page](res/facebook_login.png)

2. Navigate to **My Apps** and click the **Create App** button.

![Facebook My apps](res/facebook_myapps.png)

![Facebook creating app](res/facebook_createapp.png)

3. Enter the **App Name** in the provided field.

![Facebook app name](res/facebook_appname.png)

4. Select **Other** as the use case.  

![Facebook Other use case](res/facebook_other.png)

5. Select **Business** as the app type and click **Next**.  

![Facebook Business app type](res/facebook_business.png)

6. Choose the appropriate **Business Portfolio**, then click the **Create App** button.  

![Facebook Business portfolio option](res/facebook_portfolio.png)

7. Navigate to **App Settings → Basic**, and initiate the **Business Verification** process. 

![Facebook Business Verification](res/facebook_verification.png)

8. If prompted, connect your app to a business portfolio. 

![Facebook Connect](res/facebook_connect.png)

Click **Start Business Verification**.  

![Facebook Start Verification](res/facebook_start_verification.png)

9. On the next page, locate the **Business Verification** section and click the button to proceed with the verification process.  

![Facebook Portfolio Verification](res/facebook_portver.png)

10. Fill in the form with accurate **contact** and **organizational** information about your business.

> 📌 Make sure your submission meets [Meta's verification requirements](https://business.facebook.com/business/help/159334372093366).

After submitting the form, the review process may take up to **2 business days**.  

![Facebook Submitted](res/facebook_submitted.png)

11. Once your business is successfully verified, return to the [Developers Portal](https://developers.facebook.com/).  
In your app dashboard, locate **Marketing API** and click **Set Up**.  

![Facebook Marketing API set up](res/facebook_setup.png)

12. Grant the required token permissions: 
    - `ads_read`  
    - `read_insights`  
   
   These permissions authorize your app to access advertising data from your Facebook account.  

![Facebook permissions granting](res/facebook_checkbox.png)

13. Click the **Get Token** button.

![Facebook getting token](res/facebook_gettoken.png)

14. Copy and securely save the generated access token.  
    If needed, you can regenerate it later by navigating to **Marketing API > Tools**.

![Facebook saving token](res/facebook_token.png)

11. Once you have the access token, you can use it as described in the [Getting Started guide](GETTING_STARTED.md).

If you encounter any issues:

1. Check the "Logs" sheet for specific error messages
2. Please [visit Q&A](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a) first
3. If you want to report a bug, please [open an issue](https://github.com/OWOX/owox-data-marts/issues)
4. Join the [discussion forum](https://github.com/OWOX/owox-data-marts/discussions) to ask questions or propose improvements 