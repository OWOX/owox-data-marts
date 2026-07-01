# Connect Facebook Ads Credentials

Use this guide to connect OWOX Data Marts to the Facebook Ads API.

You can connect in two ways:

1. [**OAuth**](#oauth): use this method when **Continue with Facebook** appears.
2. [**Access Token**](#access-token): use this method for manual setup.

OAuth gives most users the shortest path.

OWOX renews supported OAuth credentials while Meta keeps the grant valid.

Manual setup requires a Meta app, an access token, an App ID, and an App Secret.

> **Self-hosted deployments:** If the **Continue with Facebook** button is not available, use the **Access Token** method.

**Before you start:** Use a Facebook account with access to the target ad account.

Accepted ad account roles: Admin, Advertiser, or Analyst.

Without access, Meta returns empty results or a permission error.

## OAuth

Click **Continue with Facebook** in the connector settings.

Log in with a Facebook account that can access the ad account.

Then confirm access.

The button shows **Authenticated as...** after a successful login.

Enter the numeric Account ID.

Do not include the `act_` prefix.

To import from multiple accounts, separate IDs with commas or semicolons.

See [where to find Account IDs](GETTING_STARTED.md#set-up-the-connector).

Reconnect with Facebook in these cases:

- The user revokes app access.
- Meta invalidates the grant.
- Required permissions change.
- The authorized user loses access to the ad account.
- The authorized user loses access to business assets.

![OWOX Facebook connector settings showing the Continue with Facebook button and the Account ID field](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/6e96957f-29cf-4e21-b45d-a05c746d4e00/public)

Next, open **Configure Data Import**.

Then choose the data you want to fetch.

See [Configure Data Import](GETTING_STARTED.md#configure-data-import).

## Access Token

Use this method when you need manual credentials.

You will create a Meta app and get an access token.

If you already used **OAuth**, skip this section.

OAuth users do not need a manual access token.

> **Before you start:** Step 3 sends your **App Secret**, authorization **code**, and **Access Token**.
> Use [Postman Desktop](https://www.postman.com/downloads/) or `curl` for better security.
> If you use [ReqBin](https://reqbin.com/), avoid shared computers.
> Do not save the request publicly.
> Delete the request or history after you copy the token.

## Step 1: Sign In to the Meta for Developers Portal

Visit [Meta for Developers](https://developers.facebook.com/).

Log in with your Facebook account.

Go to **My Apps**.

Click **Create App**.

Enter an **App Name**.

Example: `OWOX Data Marts App`.

![Meta for Developers My Apps page with the Create App button](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/007cab5d-de72-4e9c-c444-f7064be3e800/public)

![Create App form with the App Name field filled in](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/03a9f215-3cdf-4f8f-54e8-69d3c26c8700/public)

In **Use Cases**, open the **Filter by** panel.

Select **All** to list every use case.

Choose **Measure ad performance data with Marketing API**.

Connect your Business Portfolio.

Leave the other fields as default.

Click **Create app** on the final step.

> No Business Portfolio yet?
> Pick **Create a business portfolio** here.
> You can also set one up at [business.facebook.com](https://business.facebook.com/).
> Meta requires it for Marketing API access.

![App creation use-case step with "Measure ad performance data with Marketing API" selected and a Business Portfolio connected](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/2362e26c-1d95-4ea1-82d9-b54f3edc4300/public)

## Step 2: Get the App Credentials and Authorization Code

- Open your new app.
- Go to **App Settings → Basic**.
- Copy your **App ID**.
- Copy your **App Secret**.

![App Settings Basic page showing the App ID and App Secret fields](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/a488338c-60e6-423c-6ea0-0d8c6824aa00/public)

Build the authorization URL from the template below.

Replace only `YOUR_APP_ID` with your **App ID**.

OWOX requests both permissions because endpoints read different API areas:

- `ads_read` covers reporting endpoints: **Ad Account Insights** and its breakdown variants by **Age and Gender**, **Country**, **Device Platform**, **Link URL Asset**, **Product ID**, **Publisher Platform and Position**, and **Region**.
- `ads_management` covers ad account and ad object endpoints: **Ad Account**, **Ad Account User**, **Ad Account Ads**, **Ad Account Ad Creatives**, and **Ad Object (formerly Ad Group)**.

OWOX only reads data from these endpoints.

The connector does not create or change ads.

OWOX includes `ads_management` so the same token can read supported ad account and ad object data.

The URL requests both permissions in the `scope` parameter:

``` code
https://www.facebook.com/v25.0/dialog/oauth?client_id=YOUR_APP_ID&redirect_uri=http://localhost:8080/&response_type=code&scope=ads_read,ads_management&state=owox_fb_auth
```

The `state` value helps check this authorization request.

You can keep `owox_fb_auth`.

You can also replace it with random text.

- Replace `YOUR_APP_ID` in the authorization URL.
- Open the URL in your browser.
- Confirm that you use the right Facebook account.
- Click **Continue as...** or **Connect**.
- Click **Save**.
- Click **Got it**.

![Facebook authorization dialog in the browser with the Continue and Save buttons](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/ee11eeca-966e-460d-dd8d-857fdcc25500/public)

If Meta shows a `redirect_uri` error, see [Troubleshooting Credential Setup](#troubleshooting-credential-setup).

After you authorize, the browser redirects to a URL.

The URL includes long `code` and `state` parameters.

Check that the returned `state` value matches your authorization URL.

If it does not match, stop and repeat **Step 2**.

Then copy the **code** value.

Copy everything after `code=` and before `&state=...`.

You need this code in the next step.

> **Note:** You may see `This site can't be reached`.
> This is expected.
> Copy the `code` from the address bar.
> The localhost link does not open a real site.

![Browser address bar showing the code parameter on a "This site can't be reached" page](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/bff27b6c-bba3-4ffd-3e50-fd141e735f00/public)

## Step 3: Generate and Save the Access Token

Exchange the authorization code for an **Access Token**.

Use [Postman Desktop](https://www.postman.com/downloads/), `curl`, or [ReqBin](https://reqbin.com/).

Send a `POST` request to:

``` code
https://graph.facebook.com/v25.0/oauth/access_token
```

Open the **Body** tab.

Set the body type to **x-www-form-urlencoded**.

In ReqBin, choose **Form**.

In ReqBin, paste this body as one line.

Replace the placeholder values first:

``` code
client_id=YOUR_APP_ID&client_secret=YOUR_APP_SECRET&redirect_uri=http://localhost:8080/&code=CODE_FROM_THE_PREVIOUS_STEP
```

The `&` characters separate parameters in ReqBin.

Do not add an extra `&` after the `code` value.

If you use Postman Desktop, use separate key/value rows.

Open **Body → x-www-form-urlencoded**.

Add `client_id`, `client_secret`, `redirect_uri`, and `code`.

![API client POST request to the Facebook oauth/access_token endpoint](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/0ac09525-a564-437d-9356-01b66aeb4500/public)
![API client Body tab set to form-encoded with client_id, client_secret, redirect_uri, and code parameters](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/a0fd3462-03ff-495a-cfbf-e220a5fe3500/public)
![API client request with all body parameters filled in before sending](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/cf3bb6ed-3a34-4120-fabd-2e6f0d885b00/public)

Click **Send**. The response contains your **Access Token**.

![API client response panel showing the returned access_token value](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/79df572a-9f78-4b0f-dad9-fa7626908d00/public)

Copy the **Access Token**.

Store it securely.

OWOX needs the **Access Token**, **App ID**, and **App Secret**.

OWOX uses them to create a long-lived token.

> **Facebook access tokens can expire in about 60 days.**
> OWOX uses the **App ID** and **App Secret** to exchange and refresh the token.
> If Meta invalidates the token or permissions change, repeat Steps 2-3.

## Step 4: Use the Credentials

You now have the **App ID**, **App Secret**, and **Access Token**.

OWOX needs all three credentials.

Use them in the Data Mart setup.

Follow [Getting Started](GETTING_STARTED.md) to fill in the connector fields.

## Troubleshooting Credential Setup

Use this section for access token and authorization code errors.

### Error: `This authorization code has been used`

**Cause:**
You already exchanged this authorization code for an access token.

Each code works only once.

**Solution:**
Repeat **Step 2** to generate a new temporary authorization code and try again.

### Error: `redirect_uri isn't an absolute URI. Check RFC 3986`

**Cause:**
Your `redirect_uri` has the wrong format.

Meta requires a valid absolute URI.

**Solution:**
Check that your `redirect_uri` matches this format:

![API client request highlighting the correctly formatted redirect_uri value http://localhost:8080/](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/f0989ba4-5d72-433b-09d6-bf15136b5d00/public)

Example of a correct format:

``` code
http://localhost:8080/
```

### Error: `This authorization code has expired`

**Cause:**
The temporary authorization code expired.

Facebook issues short-lived codes.

**Solution:**
Repeat **Step 2** to obtain a new temporary code and retry the request.

### Error: `redirect_uri` mismatch or invalid redirect URI

**Cause:**
Meta rejected the redirect URL used in the authorization request.

**Solution:**
Add `http://localhost:8080/` as a **Valid OAuth Redirect URI**.

Use your Meta app's **Facebook Login** settings.

Then repeat **Step 2**.

> **Tip:** Generate the authorization code and use it right away.

For errors after credentials are saved, see [Troubleshooting Facebook Ads imports](TROUBLESHOOTING.md).

## Support

If you run into other issues:

1. Check [Troubleshooting Facebook Ads imports](TROUBLESHOOTING.md) for Data Mart run, permission, and account access errors.
2. Search [Q&A](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a).
3. Open an [issue](https://github.com/OWOX/owox-data-marts/issues) to report a bug.
4. Join the [discussion forum](https://github.com/OWOX/owox-data-marts/discussions).
