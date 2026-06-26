# X Ads API Credentials Setup

You need four credentials to connect the X Ads connector:

- **Consumer Key** and **Consumer Secret** — identify your developer app (Steps 1–3)
- **Access Token** and **Access Token Secret** — prove your app can access your ad account (Steps 4–6)

Steps 4–6 use OAuth 1.0a — a secure handshake that lets OWOX read your X Ads data without storing your X password.

**Before you start:** Sign up for [Postman](https://web.postman.co/) if you don't have an account yet. It's a free tool for sending API requests. You'll use it in Steps 4 and 6.

## Steps

- [Step 1: Create a Developer App](#step-1-create-a-developer-app)
- [Step 2: Request Ads API Access](#step-2-request-ads-api-access)
- [Step 3: Get Your Consumer Key and Secret](#step-3-get-your-consumer-key-and-secret)
- [Step 4: Get a Temporary OAuth Token](#step-4-get-a-temporary-oauth-token)
- [Step 5: Authorize the App](#step-5-authorize-the-app)
- [Step 6: Exchange for Permanent Tokens](#step-6-exchange-for-permanent-tokens)

---

## Step 1: Create a Developer App

Go to the [X Developer Console](https://console.x.com/) and sign in with the X (Twitter) account you use to run your ads. Click **Start Building**.

![X Developer Console welcome page with the Start Building button](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/2148c4b5-baa0-4f4c-d6f0-934eca744c00/public)

A **Create Project** dialog opens. Fill in:

- **Project Name**: anything works (for example, *OWOX Project*)
- **Use Case**: Exploring the API
- **Description**: optional

Click **Create**.

![Create Project dialog with Project Name set to "OWOX Project", Use Case set to "Exploring the API", and the Create button](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/abd4516b-5adb-456b-7d82-93209c134f00/public)

Go to the **Apps** page. Choose the **Free (Deprecated)** tier. Click **Create App**.

![X Developer Console Apps page in the Free tier showing the Create App button](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/1fc561d6-44fe-4027-bc3e-161d145f6c00/public)

Fill in the **Application Name** (for example, *OWOX Ads Connector*). Click **Create New Client Application**.

![Create New Client Application dialog with the Application Name field set to "OWOX Ads Connector" and the Create New Client Application button](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/c32db2c9-6eac-44a6-d6e1-d5f96ea94800/public)

An **Application Created Successfully** dialog appears with your **Consumer Key** and **Secret Key**. Copy both and save them in a password manager — X shows them only once.

> ⚠️ If you close this dialog without copying, go to [Step 3](#step-3-get-your-consumer-key-and-secret) to regenerate them.

![Application Created Successfully dialog showing the Consumer Key and Secret Key with Copy buttons](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/03b06acc-1ad1-47c1-28e1-38ff11703000/public)

---

## Step 2: Request Ads API Access

Creating a developer app doesn't automatically give you access to the Ads API. You need to request it separately.

Submit the [Ads API Access Form](https://docs.x.com/forms/ads-api-access).

The form asks for your **Developer App ID**. To find it:

1. Go to [console.x.com](https://console.x.com/)
2. Click on your app name
3. The App ID is the number shown next to the **ACTIVE** badge

![X Developer Console app detail page showing the App ID highlighted next to the app name](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/cf0286b1-4731-4387-376a-df8a877ae600/public)

The form also asks you to describe how you'll use the API. X grants access based on this description, so name the data areas the connector needs: **Analytics, Campaign Management, and Creatives**. These belong to Standard Access. Conversion Only access covers conversion tracking alone and won't work with this connector.

Adapt this example:

> *"We are advertisers connecting to the X Ads API to access campaign analytics, campaign management, and ad creative data for reporting and optimization. The data will be imported via the OWOX Data Marts platform to support strategic marketing decisions."*

![Ads API Access Form with fields for company info, contact details, Developer App ID, and API purpose description](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/daaf25b4-209d-4ee6-04fd-2e513164d600/public)

Submit the form. X reviews requests within 3 business days and sends an approval email to your address.

> ⛔ **Do not continue until you receive the approval email from X.**

---

## Step 3: Get Your Consumer Key and Secret

> ℹ️ **Skip this step if you already saved your Consumer Key and Secret Key in Step 1.**

Go to [console.x.com](https://console.x.com/), click your app name, then open the **Keys & Tokens** tab.

Scroll to the **OAuth 1.0 Keys** section. Click **Regenerate**.

> ⚠️ Regenerating creates new keys and invalidates the old ones. If anything was using the old keys, it will stop working.

Copy and save both values in a password manager:

- **Consumer Key**
- **Secret Key** ← X calls this "Secret Key" here, but you'll enter it as **Consumer Secret** in Postman later

![Keys & Tokens tab showing the OAuth 1.0 Keys section with the Regenerate button for Consumer Key](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/1d28c0d0-b745-4dbf-00c5-d2288663d300/public)

---

## Step 4: Get a Temporary OAuth Token

Open [Postman](https://web.postman.co/). Click the **+** button to open a new tab.

1. Change the method dropdown from **GET** to **POST**
2. Paste this URL into the address bar:

   ```text
   https://api.x.com/oauth/request_token
   ```

3. Click the **Authorization** tab (below the URL bar)
4. Open the **Auth Type** dropdown and select **OAuth 1.0**

Fill in the fields that appear on the right:

| Field | Value |
|-------|-------|
| **Signature Method** | HMAC-SHA1 |
| **Consumer Key** | your Consumer Key from [Step 1](#step-1-create-a-developer-app) or [Step 3](#step-3-get-your-consumer-key-and-secret) |
| **Consumer Secret** | your Secret Key from [Step 1](#step-1-create-a-developer-app) or [Step 3](#step-3-get-your-consumer-key-and-secret) |

Click **Send**. The response appears in the panel at the bottom of the screen. It looks like:

```text
oauth_token=E4MQKQAAAAAB1yCFAAABl2OHH80&oauth_token_secret=UlDQaqOoJHj1VvLQ8fQH6Iq686rEFww2&oauth_callback_confirmed=true
```

This is a single string with values separated by `&`. Extract both values and keep them handy — you'll use them in the next two steps:

- `oauth_token` — the value between `oauth_token=` and `&oauth_token_secret`. In the example above: `E4MQKQAAAAAB1yCFAAABl2OHH80`
- `oauth_token_secret` — the value between `oauth_token_secret=` and `&oauth_callback_confirmed`. In the example above: `UlDQaqOoJHj1VvLQ8fQH6Iq686rEFww2`

![Postman showing POST request to oauth/request_token with OAuth 1.0 selected, all fields filled, and the 200 OK response containing oauth_token and oauth_token_secret](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/5f022030-e93b-45c0-cd89-831180b19f00/public)

**Possible errors:**

This request sends only your Consumer Key and Consumer Secret. So an authentication error points to one of those two values:

- **"Could not authenticate you."** — Your Consumer Key or Consumer Secret is wrong. Re-enter them carefully and try again.
- Still failing after re-entering? [Regenerate the keys in Step 3](#step-3-get-your-consumer-key-and-secret), then use the new values.

---

## Step 5: Authorize the App

Replace `YOUR_OAUTH_TOKEN` in the URL below with the `oauth_token` value you saved in Step 4:

```text
https://api.x.com/oauth/authorize?oauth_token=YOUR_OAUTH_TOKEN
```

For example, if your `oauth_token` is `E4MQKQAAAAAB1yCFAAABl2OHH80`, the URL is:

```text
https://api.x.com/oauth/authorize?oauth_token=E4MQKQAAAAAB1yCFAAABl2OHH80
```

Open the URL in your browser. An authorization page appears. Click **Authorize app**.

![X authorization page in the browser showing the Authorize app button circled, with the oauth_token visible in the URL bar](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/9c0193cf-c076-480c-6732-b883cbd6a700/public)

After you click Authorize app, X shows a page with a **numeric PIN**. Copy the PIN and save it — you'll enter it in Step 6.

> ℹ️ If X redirects you to a website instead of showing a PIN, look at the URL bar. Copy the `oauth_verifier` value from it — that value serves the same purpose as the PIN. Use it as the **Verifier** in Step 6.

**Possible errors:**

- **"The request token for this page is invalid."** — The `oauth_token` expired. Temporary tokens are short-lived. Go back to [Step 4](#step-4-get-a-temporary-oauth-token), request a new one, and complete Steps 5–6 without delay.

![X error page showing "Whoa there! The request token for this page is invalid" message](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/f42faf43-bf63-4ae4-0f7a-a8bf32de4600/public)

---

## Step 6: Exchange for Permanent Tokens

In [Postman](https://web.postman.co/), open a **new tab** (click **+**) to keep this request separate from the one in Step 4.

1. Change the method to **POST**
2. Paste this URL:

   ```text
   https://api.x.com/oauth/access_token
   ```

3. Click the **Authorization** tab and select **OAuth 1.0**

Fill in the fields. Note: the **Access Token** and **Access Token Secret** here are the *temporary* values from Step 4.

| Field | Value |
|-------|-------|
| **Signature Method** | HMAC-SHA1 |
| **Consumer Key** | your Consumer Key from [Step 1](#step-1-create-a-developer-app) or [Step 3](#step-3-get-your-consumer-key-and-secret) |
| **Consumer Secret** | your Secret Key from [Step 1](#step-1-create-a-developer-app) or [Step 3](#step-3-get-your-consumer-key-and-secret) |
| **Access Token** | `oauth_token` from [Step 4](#step-4-get-a-temporary-oauth-token) (temporary) |
| **Access Token Secret** | `oauth_token_secret` from [Step 4](#step-4-get-a-temporary-oauth-token) (temporary) |
| **Verifier** | the PIN from [Step 5](#step-5-authorize-the-app) |

Click **Send**. The response appears in the bottom panel:

```text
oauth_token=1534231826281152515-kDGnM70as1fh6xoYWK9HvlwtDHHqe8&oauth_token_secret=KiXVKSyHifVoVm7vq3iC7zjclE1ocqvgpouS95RuLXM61&user_id=1534231826281152213&screen_name=examplename
```

Save these two values — these are your permanent credentials:

- `oauth_token` → this is your **Access Token**
- `oauth_token_secret` → this is your **Access Token Secret**

![Postman showing the POST request to oauth/access_token with OAuth 1.0 settings filled in and the 200 OK response containing oauth_token and oauth_token_secret](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/6915799f-aacc-4c7e-b7c4-19da4fbd4700/public)

---

## Your Credentials

You now have all four credentials for the connector:

| Credential | What X calls it | Where it comes from |
|------------|-----------------|---------------------|
| Consumer Key | Consumer Key | [Step 1](#step-1-create-a-developer-app) or [Step 3](#step-3-get-your-consumer-key-and-secret) |
| Consumer Secret | Secret Key | [Step 1](#step-1-create-a-developer-app) or [Step 3](#step-3-get-your-consumer-key-and-secret) |
| Access Token | `oauth_token` | [Step 6](#step-6-exchange-for-permanent-tokens) response |
| Access Token Secret | `oauth_token_secret` | [Step 6](#step-6-exchange-for-permanent-tokens) response |

Go to the [Getting Started Guide](GETTING_STARTED.md) to complete the setup.

---

## Support

- Join the [**Slack Community**](https://join.slack.com/t/owox-data-marts/shared_invite/zt-3tnigd08g-f2uU_7oNNwzCyTB2tITnqA) to ask questions and connect with other users
- Browse the [**Q&A section**](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a) for common answers
- Found a bug? [**Open an issue**](https://github.com/OWOX/owox-data-marts/issues)
- Have a suggestion? [**Start a discussion**](https://github.com/OWOX/owox-data-marts/discussions)
