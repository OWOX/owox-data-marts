# DigitalOcean

> **DigitalOcean.com** is a cloud infrastructure provider that offers simple, scalable, and developer-friendly cloud computing solutions. Required services for deployment:
>
> * **App Platform**: Platform-as-a-Service (PaaS)
> * **Managed Databases**: MySQL

## Create Database

Follow <https://cloud.digitalocean.com/databases/new> and choose MySQL v8 as a database engine.

Start with default settings and tune as you go. After creating a database cluster, see `Connection Details` for `Public network`, e.g.:

```text
username = doadmin
password = AVNS_yHuWeSyIc8ZaV7n0yxs
host = db-mysql-nyc3-77688-do-user-25711522-0.j.db.ondigitalocean.com
port = 25060
database = defaultdb
```

You will need these credentials later.

## Create App

Follow <https://cloud.digitalocean.com/apps/new?source_provider=ghcr> with the following parameters:

* Repository: `owox/owox-data-marts`
* Image tag or digest: `latest` (or `next`)

Start with default settings and tune as you go. After creating an app, you'll have a `Live App` URL like `https://octopus-app-wqkna.ondigitalocean.app/`. You will need this URL later.

## Configure App-Level Environment Variables

**Important!** Customize the configuration from the example below with your deployment specifics and wait until redeploy:

**Step 1.** Paste your actual database credentials for:

* `host` to `DB_HOST`
* `port` to `DB_PORT`
* `username` to `DB_USERNAME`
* `password` to `DB_PASSWORD`
* `database` to `DB_DATABASE`

**Step 2.** Use a unique `IDP_BETTER_AUTH_SECRET` 32-character key that you can generate via `openssl rand -base64 32` in a local terminal or another method.

👉 Go to App's `Settings` tab and edit `App-Level Environment Variables` (App will be automatically redeployed) via the `Bulk Editor` button with configuration **like** that:

Example:

```text
PUBLIC_ORIGIN=https://octopus-app-wqkna.ondigitalocean.app
DB_TYPE=mysql
DB_HOST=db-mysql-nyc3-77688-do-user-25711522-0.j.db.ondigitalocean.com
DB_PORT=25060
DB_USERNAME=doadmin
DB_PASSWORD=AVNS_yHuWeSyIc8ZaV7n0yxs
DB_DATABASE=defaultdb
IDP_PROVIDER=better-auth
IDP_BETTER_AUTH_SECRET=pw/1VHJStJeLThUeFtHoRlKSdRHHIYKPMnYMSO+86bA=
```

## Add First Admin

1. Go to the App's `Console` tab
2. Run the command `owox idp add-user user@example.com` (use **your email** instead of `user@example.com`)
3. Copy the **Magic Link** from the response and open it in your browser
4. Create a **password** and **Log In** with your email and password
5. Use the `/auth` page to manage users within your deployment (e.g., `https://octopus-app-wqkna.ondigitalocean.app/auth`)
