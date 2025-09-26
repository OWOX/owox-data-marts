# Render

> **Render.com** is a cloud hosting platform that provides an easy way to run web applications without complex infrastructure setup. With Render, you can quickly deploy and start using **OWOX Data Marts** from a pre-built container image, without managing servers manually.

## Create a Web Service

<https://github.com/user-attachments/assets/5f299b5a-f581-4027-acc1-3f3b9bc16b65>

### Prerequisites

- A [Render](https://render.com) account (e.g GitHub or Google login)
- A valid payment method (Render requires a paid plan for persistent storage and shell)

### Step 1: Set container image as Source Code

1. From the dashboard, click **New → Web Service**
2. Select **Existing image** as Source Code
3. Enter the image name `ghcr.io/owox/owox-data-marts` (or `ghcr.io/owox/owox-data-marts:next` for newest snapshot) and click **Connect**
4. Configure basic settings:

- **Name**: e.g `owox-your-company-name`
- **Region**: choose your region for lower latency
- **Instance Type**: Standard (or higher)

### Step 2: Add Persistent Disk

In the Advanced → **Disks** section, add:

- **Size**: 5 GB (or higher)
- **Mount Path**: `/root/.local/share/owox/` (this ensures your database is not lost on restart)

### Step 3: Deploy

1. Click **Deploy Web Service**
2. Wait until the service builds and starts

## Configure Authorization Better-Auth (recommended)

<https://github.com/user-attachments/assets/e7adacff-cdb5-40d8-bb07-e6d2f0be445b>

### Step 1: Environment Variables

Go **Environment** section in menu and set:

| NAME_OF_VARIABLE               | Value (example)                                              | Notes                                                                                                          |
|--------------------------------|--------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------|
| `PUBLIC_ORIGIN`                | `https://owox-your-company-name.onrender.com`               | Public origin (external URL) of your app. It is formed automatically from the name you entered. Just copy it from UI.                                              |
| `IDP_PROVIDER`                 | `better-auth`                                               | Authentication provider                                                        |
| `IDP_BETTER_AUTH_SECRET`       | `your_secret_key`                                           | Recommended: use a 32-character key. You can generate one with command `openssl rand -base64 32` in local terminal.                      |
| `IDP_BETTER_AUTH_BASE_URL`     | `https://owox-your-company-name.onrender.com`               | Deployment URL. It is formed automatically from the name you entered. Just copy it from UI|
| `IDP_BETTER_AUTH_TRUSTED_ORIGINS` | `http://localhost:10000,https://owox-your-company-name.onrender.com` | Comma-separated list of allowed origins. Include both local development (`http://localhost:10000`) and your production `PUBLIC_ORIGIN`. |

### Step 2: Add first admin

1. Go to **Shell** section in menu
2. Run command `owox idp add-user user@example.com` (☝️ use **your email** instead of `user@example.com`)
3. Copy **Magic Link** from the response and open it in your browser
4. Create a **password** and **Log In** with email/password
5. Use `/auth` page to manage users within your deployment (e.g. `https://owox-your-company-name.onrender.com/auth`)

---

## Troubleshooting

- **504 Gateway Timeout**
  - Ensure the app listens on the `PORT` provided by Render
  - Increase Health Check timeout to 10–15s

- **Database not persisted**  
  - Check `DATABASE_URL` points to `/root/.local/share/owox/`
  - Ensure the persistent disk is attached

- **App runs but blank page**  
  - Verify `PUBLIC_ORIGIN` is set correctly
  - Check logs for missing dependencies or misconfigured variables

---

## Next Steps

- Join the community on [GitHub Discussions](https://github.com/OWOX/owox-data-marts/discussions)
