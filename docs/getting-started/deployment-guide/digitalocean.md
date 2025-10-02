# DigitalOcean

> **DigitalOcean.com** is a cloud infrastructure provider that offers simple, scalable, and developer-friendly cloud computing solutions. Required services for deployment:
>
> * **App Platform**: Platform-as-a-Service (PaaS)
> * **Managed Databases**: MySQL

## 1. Create Database

Follow <https://cloud.digitalocean.com/databases/new> and choose MySQL v8 as a database engine.

Start with default settings and tune as you go. After creating a database cluster, see `Connection Details` for `Public network`, e.g.:

```text
username = doadmin
password = AVNS_yHuWeSyIc8ZaV7n0yxs
host = db-mysql-nyc3-77688-do-user-25711522-0.j.db.ondigitalocean.com
port = 25060
database = defaultdb
```

You will use these 👆 credentials later in [Section 3. Configure App-Level Environment Variables](#3-configure-app-level-environment-variables).

---

## 2. Create App

Follow <https://cloud.digitalocean.com/apps/new?source_provider=ghcr> with the following parameters:

* Repository: `owox/owox-data-marts`
* Image tag or digest: `latest` (or `next`)

Start with default settings and tune as you go. After creating an app, you'll have a `Live App` URL like `https://owox-data-marts-best-enma6.ondigitalocean.app`. You will need this URL later.

<https://github.com/user-attachments/assets/3e9a20c9-933d-4715-a0a0-f654ae41e50c>

---

## 3. Configure App-Level Environment Variables

👉 Go to App's `Settings` tab and edit `App-Level Environment Variables` (App will be automatically redeployed) via the `Bulk Editor` button with configuration **like** that:

**Important!** Customize the configuration from the example below with your deployment specifics and wait until redeploy:

**Step 1.** Paste your actual `Live App` URL to `PUBLIC_ORIGIN`. E.g. `https://owox-data-marts-best-enma6.ondigitalocean.app` (make sure there is no `/` in the end of URL):

**Step 2.** Paste your actual database credentials for:

* `host` to `DB_HOST`
* `port` to `DB_PORT`
* `username` to `DB_USERNAME`
* `password` to `DB_PASSWORD`
* `database` to `DB_DATABASE`

**Step 3.** Use a unique `IDP_BETTER_AUTH_SECRET` 32-character key that you can generate via `openssl rand -base64 32` in a local terminal or another method.

Example:

```text
PUBLIC_ORIGIN=https://owox-data-marts-best-enma6.ondigitalocean.app
DB_TYPE=mysql
DB_HOST=db-mysql-nyc3-77688-do-user-25711522-0.j.db.ondigitalocean.com
DB_PORT=25060
DB_USERNAME=doadmin
DB_PASSWORD=AVNS_yHuWeSyIc8ZaV7n0yxs
DB_DATABASE=defaultdb
IDP_PROVIDER=better-auth
IDP_BETTER_AUTH_SECRET=pw/1VHJStJeLThUeFtHoRlKSdRHHIYKPMnYMSO+86bA=
```

<https://github.com/user-attachments/assets/6601344a-3398-44b7-aaf6-7a077395b494>

---

## 4. Add First Admin

1. Go to the App's `Console` tab
2. Run the command `owox idp add-user user@example.com` (use **your email** instead of `user@example.com`)
3. Copy the **Magic Link** from the response and open it in your browser
4. Create a **password** and **Log In** with your email and password
5. Use the `/auth` page to manage users within your deployment (e.g., `https://owox-data-marts-best-enma6.ondigitalocean.app/auth`)

<https://github.com/user-attachments/assets/a8150a33-cef5-4844-8c6b-cae981a685ea>

---

## 5. Update Deployment on DigitalOcean

To keep your **owox-data-marts** up to date with the latest fixes and improvements, make sure you are always running the most recent version.  
To update your deployment, go to your **App** in DigitalOcean, click **Actions** → **Deploy**.

<https://github.com/user-attachments/assets/c853c888-d373-4085-81a5-0011ddee6aea>
