# How to obtain the access token for the Facebook Ads source

Follow these steps to connect the Facebook Ads API and start importing data.

There are two ways to get access to the Facebook data in Data Mart:

1. [**OAuth**](#oauth) — recommended for most users. It is the easiest path, and OWOX renews supported OAuth credentials while Meta keeps the authorization grant valid.
2. [**Access Token**](#access-token) — for advanced or manual setups. You generate the token yourself and refresh it every ~60 days.

> **Self-hosted deployments:** Use the **Access Token** method. Self-hosted deployments can use only manual credentials.  
> **Before you start:** Whichever method you choose, sign in with a Facebook account that has a role on the target ad account. Accepted roles: Admin, Advertiser, or Analyst. Without access, the connector returns empty results or a permissions error.

## OAuth

Press the **Continue with Facebook** button in Data Mart Configure Settings.

Log in with an account that can access the ad data, then confirm access. The button shows 'Authenticated as…' once you sign in successfully.

Reconnect with Facebook if the user revokes app access, Meta invalidates the grant, required permissions are removed or changed, or the authorized user loses access to the selected ad account or business assets.

Then enter the numeric Account ID you want to fetch data from, without the `act_` prefix. To import data from multiple ad accounts, separate IDs with commas or semicolons. [Where to find Account IDs?](https://docs.owox.com/packages/connectors/src/sources/facebook-marketing/getting-started/#set-up-the-connector)

![OWOX Facebook connector settings showing the Continue with Facebook button and the Account ID field](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/6e96957f-29cf-4e21-b45d-a05c746d4e00/public)

Next, open the **Configure Data Import** step in the connector settings to choose the data you want to fetch. See the [Getting Started guide](https://docs.owox.com/packages/connectors/src/sources/facebook-marketing/getting-started/#configure-data-import).

## Access Token

Create your own Meta app and run the OAuth code flow to get an Access Token.

> **Before you start:** Step 3 sends your **App Secret**, authorization **code**, and returned **Access Token**. For better security, use a local tool such as [Postman Desktop](https://www.postman.com/downloads/) or `curl`. If you use a web API client such as [ReqBin](https://reqbin.com/), avoid shared computers, do not save the request publicly, and delete the request or history after copying the token.

## Step 1: Sign In to the Meta for Developers Portal

Visit [Meta for Developers](https://developers.facebook.com/) and log in with your Facebook account. Go to **My Apps** and click **Create App**. Enter an **App Name** — for example, 'OWOX Data Marts App'.

![Meta for Developers My Apps page with the Create App button](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/007cab5d-de72-4e9c-c444-f7064be3e800/public)

![Create App form with the App Name field filled in](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/03a9f215-3cdf-4f8f-54e8-69d3c26c8700/public)

In the Use Cases section, in the left **Filter by** panel, select **All**. Choose **Measure ad performance data with Marketing API** as the use case. Connect your Business Portfolio. Leave the other fields as default, then click **Create app** on the final step.

> No Business Portfolio yet? Pick **Create a business portfolio** here, or set one up first at [business.facebook.com](https://business.facebook.com/). You need one to read ad data through the Marketing API.

![App creation use-case step with "Measure ad performance data with Marketing API" selected and a Business Portfolio connected](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/2362e26c-1d95-4ea1-82d9-b54f3edc4300/public)

## Step 2: Get the App Credentials and Authorization Code

- Go to **App Settings → Basic**
- Copy your **App ID**
- Also note your **App Secret** (you’ll need it in the next step)

![App Settings Basic page showing the App ID and App Secret fields](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/a488338c-60e6-423c-6ea0-0d8c6824aa00/public)

Build the authorization URL from the template below. Replace only `YOUR_APP_ID` with your actual **App ID**.

The connector requests both permissions because different OWOX endpoints read different parts of the Marketing API:

- `ads_read` is used for reporting endpoints: `ad-account/insights` and the `ad-account/insights-by-*` breakdown endpoints.
- `ads_management` is used for ad account and ad object endpoints: `ad-account`, `ad-account-user`, `ad-account/ads`, `ad-account/adcreatives`, and `ad-group`.

OWOX only reads data from these endpoints. The `ads_management` permission is included so the same token can read supported ad account and ad object data; the connector does not create or change ads.

The URL requests both permissions in the `scope` parameter:

``` code
https://www.facebook.com/v25.0/dialog/oauth?client_id=YOUR_APP_ID&redirect_uri=http://localhost:8080/&response_type=code&scope=ads_read,ads_management&state=owox_fb_auth
```

The `state` value is a safety check for this authorization request. You can leave `owox_fb_auth` as is, or replace it with any random text.

- Open the URL in your browser
- Confirm you're logged in with the account that can access the ad account
- Click **Continue as...** or **Connect**
- Click **Save** and **Got it**

![Facebook authorization dialog in the browser with the Continue and Save buttons](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/ee11eeca-966e-460d-dd8d-857fdcc25500/public)

After you authorize, the browser redirects to a URL with long `code` and `state` parameters.

Confirm the `state` value in the redirected URL matches the `state` value in your authorization URL. If it does not match, stop and repeat **Step 2**.

Then copy and save the **code** value (everything after `code=` up to `&state=...`). You need it in the next step.

> **Note:** It's normal to see a 'This site can't be reached' error on this page. You only need the `code` from the address bar — the localhost link is not meant to open a real site.

![Browser address bar showing the code parameter on a "This site can't be reached" page](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/bff27b6c-bba3-4ffd-3e50-fd141e735f00/public)

## Step 3: Generate and Save the Access Token

Exchange the authorization code for an **Access Token**. Use [Postman Desktop](https://www.postman.com/downloads/), `curl`, or [ReqBin](https://reqbin.com/) and send a `POST` request to:

``` code
https://graph.facebook.com/v25.0/oauth/access_token
```

Open the **Body** tab and set the body type to **x-www-form-urlencoded** (in ReqBin, choose **Form**). In ReqBin, paste the body as one line, replacing the placeholder values first:

``` code
client_id=YOUR_APP_ID&client_secret=YOUR_APP_SECRET&redirect_uri=http://localhost:8080/&code=CODE_FROM_THE_PREVIOUS_STEP
```

The `&` characters separate parameters in ReqBin. Do not add an extra `&` after the `code` value.

If you use Postman Desktop, you can enter the same values as separate **Body → x-www-form-urlencoded** key/value rows: `client_id`, `client_secret`, `redirect_uri`, and `code`.

![API client POST request to the Facebook oauth/access_token endpoint](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/0ac09525-a564-437d-9356-01b66aeb4500/public)
![API client Body tab set to form-encoded with client_id, client_secret, redirect_uri, and code parameters](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/a0fd3462-03ff-495a-cfbf-e220a5fe3500/public)
![API client request with all body parameters filled in before sending](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/cf3bb6ed-3a34-4120-fabd-2e6f0d885b00/public)

Click **Send**. The response contains your **Access Token**.

![API client response panel showing the returned access_token value](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/79df572a-9f78-4b0f-dad9-fa7626908d00/public)

Copy and securely save the **Access Token**. You need it together with the **App ID** and **App Secret** to create a long-lived token in OWOX.

> ⚠️ **Facebook access tokens can expire in about 60 days.** OWOX uses the **App ID** and **App Secret** to exchange and refresh the token. If Facebook invalidates the token or permissions change, reconnect by repeating Steps 2–3 to generate a new access token.

## Step 4: Use the Credentials

At this moment, you have the **App ID**, **App Secret**, and **Access Token**. OWOX needs all three credentials to create and refresh a long-lived token.

With the credentials ready, follow the [Getting Started guide](GETTING_STARTED.md) for a detailed tutorial on filling in the Data Mart configuration fields.

## Troubleshooting Credential Setup

Hit an error while getting the access token or exchanging the authorization code? Check the causes and fixes below.

### Error: `This authorization code has been used`

**Cause:**
You already exchanged this authorization code for an access token. Each code works only once.

**Solution:**
Repeat **Step 2** to generate a new temporary authorization code and try again.

### Error: `redirect_uri isn't an absolute URI. Check RFC 3986`

**Cause:**
Your `redirect_uri` is malformed or incomplete. It must be a **valid absolute URI**.

**Solution:**
Check that your `redirect_uri` exactly matches the format below:

![API client request highlighting the correctly formatted redirect_uri value http://localhost:8080/](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/f0989ba4-5d72-433b-09d6-bf15136b5d00/public)

Example of a correct format:

``` code
http://localhost:8080/
```

### Error: `This authorization code has expired`

**Cause:**
The temporary authorization code expired. Facebook issues short-lived codes, so exchange them for a token within a short time window.

**Solution:**
Repeat **Step 2** to obtain a new temporary code and retry the request.

### Error: `redirect_uri` mismatch or invalid redirect URI

**Cause:**
Meta rejected the redirect URL used in the authorization request.

**Solution:**
Add `http://localhost:8080/` as a **Valid OAuth Redirect URI** in your Meta app's **Facebook Login** settings, then repeat **Step 2**.

---

> ✅ **Tip:** Generate the authorization code and use it right away, before it expires.

For errors after credentials are saved, see [Troubleshooting Facebook Ads imports](TROUBLESHOOTING.md).

## Troubleshooting and Support

If you run into other issues:

1. Check [Troubleshooting Facebook Ads imports](TROUBLESHOOTING.md) for Data Mart run, permission, and account access errors.
2. [Visit Q&A](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a) first — your question may already be answered.
3. Found a bug? [Open an issue](https://github.com/OWOX/owox-data-marts/issues).
4. Join the [discussion forum](https://github.com/OWOX/owox-data-marts/discussions) to ask questions or propose improvements.
