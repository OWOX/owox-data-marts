## How to obtain the access token for the Facebook Ads connector

1. Visit the [Meta for Developers](https://developers.facebook.com/) site and log in with your Facebook account.

![Facebook login page](/src/Integrations/FacebookMarketing/res/facebook_login.png)

2. Navigate to **My Apps** and click the **Create App** button.

![Facebook creating app](/src/Integrations/FacebookMarketing/res/facebook_createapp.png)

3. Enter the **App Name** and **App Contact Email** in the provided fields.

![Facebook app name](/src/Integrations/FacebookMarketing/res/facebook_appname.png)

4. Select **Other** as the use case.  

![Facebook Other use case](/src/Integrations/FacebookMarketing/res/facebook_other.png)

5. Choose the **Business** app type and click **Next**.

![Facebook Business app type](/src/Integrations/FacebookMarketing/res/facebook_business.png)

6. Select the relevant **Business Portfolio**, then click the **Create App** button.

![Facebook Business portfolio option](/src/Integrations/FacebookMarketing/res/facebook_portfolio.png)

7. In the app dashboard, locate **Marketing API** and click **Set Up**.  

![Facebook Marketing API set up](/src/Integrations/FacebookMarketing/res/facebook_setup.png)

8. Grant the required token permissions: 
    - `ads_read`  
    - `read_insights`  
   
   These permissions authorize your app to access advertising data from your Facebook account.  

![Facebook permissions granting](/src/Integrations/FacebookMarketing/res/facebook_checkbox.png)

9. Click the **Get Token** button.

![Facebook getting token](/src/Integrations/FacebookMarketing/res/facebook_gettoken.png)

10. Copy and securely save the generated access token.  
    If needed, you can regenerate it later by navigating to **Marketing API > Tools**.

![Facebook saving token](/src/Integrations/FacebookMarketing/res/facebook_token.png)

11. Once you have the access token, you can use it as described in the [Getting Started guide](/src/Integrations/FacebookMarketing/GETTING_STARTED.md).