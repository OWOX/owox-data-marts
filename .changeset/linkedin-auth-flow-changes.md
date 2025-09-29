---
'owox': minor
---

# ⚠️ Breaking Change: LinkedIn Authentication Update

**What changed:**
LinkedIn connectors now require **3 credentials** instead of 1 Access Token: Client ID, Client Secret, and Refresh Token.

**What you need to do:**

1. Go to [LinkedIn Developer Portal](https://developer.linkedin.com/) → your app → **Auth** tab
2. Copy these 3 values:
   - **Client ID** (top of Auth page)
   - **Client Secret** (top of Auth page)  
   - **Refresh Token** (generate via OAuth 2.0 tools)

**How to update:**

1. Go to your OWOX Data Marts
2. Find your LinkedIn connector configuration
3. Enter the 3 new credentials instead of the old Access Token:
   - **Client ID**
   - **Client Secret**
   - **Refresh Token**
