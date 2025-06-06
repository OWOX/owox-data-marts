## How to obtain the credentials for the Reddit Ads source

1. Visit the [Reddit Preferences page](https://www.reddit.com/prefs/apps) and log in with your Reddit account, or create a new one.
2. Click the **Create App** button.
![Reddit creating app](res/reddit_createapp.png)
3. Enter the **App Name** and **Description**. Choose the **script** type.  
   In the **redirect URI** field, enter: `http://localhost:8080`  
   Then click the **Create App** button. 
![Reddit app name](res/reddit_appname.png)
4. Once the app is created, you'll see part of the required credentials: **App Name**, **Client ID**, **Client Secret**, and **Redirect URI**. 
![Reddit app credentials](res/reddit_app_info.png)
5. [Register to use the Reddit API](https://support.reddithelp.com/hc/en-us/requests/new?ticket_form_id=14868593862164). 
In the form, select:  
   - **"I'm a Developer"**  
   - **"I want to register to use the free tier of the Reddit API"**  
Paste the **Client ID** you received into the **OAUTH Client ID(s)** field.
6. To obtain the authorization code, use the following URL (replace `YOUR_CLIENT_ID` and `RANDOM_STRING` accordingly, for example, **abc123**):
```
https://www.reddit.com/api/v1/authorize
  ?client_id=YOUR_CLIENT_ID
  &response_type=code
  &state=RANDOM_STRING
  &redirect_uri=http://localhost:8080
  &duration=permanent
  &scope=read
  ```
Open the URL in your browser, press **Enter**, and then click **Allow** when prompted (make sure you're logged into the Reddit account that has access to your ads).  
![Reddit app request](res/reddit_request.png)

7. After granting access, you'll be redirected to a URL like this:  
`http://localhost:8080/?state=xyz123&code=bLcIq0FR9-8hjOpklbxK2dtRTsA#_`  
Copy the value of the `code` parameter — in this example, it is `bLcIq0FR9-8hjOpklbxK2dtRTsA`.  

![Reddit code](res/reddit_code.png)

8. Use Postman or a terminal to exchange the authorization code for a refresh token.  
Replace `YOUR_CODE` with the code from the previous step. Use **Basic Auth**, where the username is your **Client ID** and the password is your **Client Secret**:

```POST https://www.reddit.com/api/v1/access_token?grant_type=authorization_code&code=YOUR_CODE&redirect_uri=http://localhost:8080```

![Reddit refresh](res/reddit_refresh.png)

Once you have all the credentials, you can use them as described in the [Getting Started guide](GETTING_STARTED.md).



