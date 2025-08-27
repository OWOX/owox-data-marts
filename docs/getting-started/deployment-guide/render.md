# Render

> **Render.com** is a cloud hosting platform that provides an easy way to run web applications without complex infrastructure setup. With Render, you can quickly deploy and start using **OWOX Data Marts** from a pre-built container image, without managing servers manually.

## Prerequisites

- A [Render](https://render.com) account (e.g GitHub or Google login)
- A valid payment method (Render requires a paid plan for persistent storage and shell)

## Step 1: Create Web Service

1. From the dashboard, click **New → Web Service**
2. Select **Existing image** as Source Code
3. Enter the image name `ghcr.io/owox/owox-data-marts` (or `ghcr.io/owox/owox-data-marts:next` for newest snapshot)
4. Configure basic settings:

- **Name**: e.g `owox-your-company-name`
- **Region**: choose your region for lower latency
- **Instance Type**: Standard (or higher)
- In the Advanced → **Disks** section, add:  
  - **Size**: 5 GB (or higher)  
  - **Mount Path**: `/root/.local/share/owox/sqlite` (this ensures your database is not lost on restart)

## Step 2: Environment Variables

Go to **Environment → Add Environment Variable** and add:

- TBD

## Step 3: Deploy

1. Click **Deploy Web Service**
2. Wait until the service builds and starts
3. Open the generated URL (e.g. `https://owox-company-name.onrender.com`)
4. Log in with your admin credentials (`APP_ADMIN_EMAIL` + `APP_ADMIN_PASSWORD`)

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
