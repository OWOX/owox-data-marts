# Render

> **Render.com** is a cloud hosting platform that provides an easy way to run web applications without complex infrastructure setup. With Render, you can quickly deploy and start using **OWOX Data Marts** from a pre-built container image, without managing servers manually.

## Prerequisites

- A [Render](https://render.com) account (GitHub or Google login)
- A valid payment method (Render requires a paid plan for persistent storage)
- Access to the OWOX Data Marts Docker image (e.g., `ghcr.io/owox/owox-data-marts:latest`)

## Step 1: Sign up and Billing

1. Go to [render.com](https://render.com) → **Sign up**
2. Log in with GitHub or Google
3. In **Billing**, add your payment method and choose at least a Starter plan (needed for Persistent Disk)

## Step 2: Create Web Service

1. From the dashboard, click **New → Web Service**
2. Select **Deploy an existing image (Docker)**
3. Enter the image name, for example:  ghcr.io/owox/owox-data-marts:latest
4. Configure basic settings:
  - **Name**: e.g `owox-company-name`
  - **Region**: choose your region for lower latency
  - **Instance Type**: Starter (or higher)
  - **Autoscaling**: Off (recommended for first setup)
  - **Health Check Path**: `/` or `/api/health`

## Step 3: Persistent Disk (SQLite)

1. In the **Disks** section, add:  
   - **Name**: `owox-data`  
   - **Size**: 1–5 GB (start small)  
   - **Mount Path**: `/root/.local/share/owox/sqlite`

2. This ensures your database is not lost on restart

## Step 4: Environment Variables

Go to **Environment → Add Environment Variable** and add:

- TBD

## Step 5: Deploy

1. Click **Create Web Service**
2. Wait until the service builds and starts
3. Open the generated URL (e.g. `https://owox-company-name.onrender.com`)
4. Log in with your admin credentials (`APP_ADMIN_EMAIL` + `APP_ADMIN_PASSWORD`)

## Step 6: Optional Settings

- **Auto-Deploys**: enable automatic redeploys on new image versions
- **Custom Domain**: connect your own domain (SSL included by Render)
- **Logs & Metrics**: check for errors or performance issues in **Logs**

---

## Troubleshooting

- **504 Gateway Timeout**
  - Ensure the app listens on the `PORT` provided by Render
  - Increase Health Check timeout to 10–15s

- **Database not persisted**  
  - Check `DATABASE_URL` points to `/root/.local/share/owox/sqlite`
  - Ensure the persistent disk is attached

- **App runs but blank page**  
  - Verify `BASE_URL` is set correctly
  - Check logs for missing dependencies or misconfigured variables

---

## Next Steps

- Join the community on [GitHub Discussions](https://github.com/OWOX/owox-data-marts/discussions)
