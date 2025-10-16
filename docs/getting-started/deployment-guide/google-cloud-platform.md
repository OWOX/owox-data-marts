# Google Cloud Platform

> **Google Cloud Platform** lets you run serverless, container-based applications alongside a fully managed relational database
> – delivering autoscaling, reliability, and minimal operational overhead.
>
> Required services for deployment:
>
> * **Cloud Run**: a fully managed application hosting that allows you to run container on top of Google's highly scalable infrastructure
> * **Cloud SQL**: a fully managed database service for MySQL, reducing your overall cost of operations and freeing up teams to focus on innovation

## Create a MySQL instance

Follow <https://console.cloud.google.com/sql/instances/create;engine=MySQL> link and further guide to create a MySQL instance.  

### Choose a Cloud SQL edition

**Enterprise** is OK for most deployments.

Choose a preset for this edition: start with **Sandbox** and tune as you go.

### Instance info

Database version: **MySQL 8.0**

**Instance ID**: `owox-data-marts-db`

**Password**: generate `root` user's password and save it. We will NOT use `root` user for OWOX Data Marts deployment,
but you may need it for other use cases.

### Choose region and zonal availability

**Region**: choose a region you want to store OWOX Data Marts configuration

### Customize your instance

**Machine configuration**. Start with `General purpose - Shared core` – `1 vCPU, 1.7 GB` and tune as you go.

**Connections**. The easiest way to use CloudSQL instances is to allow connecting to it from anywhere.
While it is not the best practice from the security view point, you can change it later.

Use `Add network`:

* **Name**: `all`
* **IP range**: `0.0.0.0/0`
* check **I acknowledge the risks**.
and click **Done**.

### Create an instance

Press `Create instance` and wait till instance will be created.
It may take ~10 minutes, manual page refresh may be needed.
See `Connect to this instance` section, save for further configuration:

* **Default TCP database port number** (e.g `3306`)
* **Public IP address** (e.g. `34.41.185.251`)

### Create a database

Go to **Databases** section and click `Create database`. Enter **Database Name** `owox-data-marts-db` and click `Create`.

### Create a user

Go to **Users** section and click `Add user account`.

Use **Built-in authentication** with

* **User name**: `owox-data-marts-app`
* **Password**: generate it and save for further configuration
and click `Add`.

## Create a Cloud Run service

Follow <https://console.cloud.google.com/run/create?enableapi=true&deploymentType=container> link and further guide to create a Cloud Run service.

### Configure

**Container image URL**: `us-docker.pkg.dev/owox-registry/ghcr/owox/owox-data-marts:latest`

Copy **Endpoint URL** and save for further configuration.

**Authentication**: `Allow public access`. OWOX Data Marts application provides built-in authentication.

**Billing**: `Instance-based`

**Service scaling**: `Manual scaling`

**Number of instances**: `1`. OWOX Data Marts application requires at least one instance running continuously to enable scheduled scenarios.

**Ingress**: `All`

### Containers, Volumes, Networking, Security

#### `Containers` → `Settings` tab

**Resources**: Memory: `1GiB`, CPU: `1`

**Execution environment**: Second generation

#### `Containers` → `Variables & Secrets` tab

**Important!** Customize the configuration from the example below with your deployment specifics.

**Step 1.** Paste your actual `Endpoint URL` to `PUBLIC_ORIGIN`. E.g. `https://owox-data-marts-312784848198.europe-west1.run.app` (make sure there is no `/` in the end of URL):

**Step 2.** Paste your actual database configuration for:

* `DB_TYPE` to `mysql`
* `DB_HOST` to database's **Public IP address**
* `DB_PORT` to database's **Default TCP database port number**
* `DB_USERNAME` to `owox-data-marts-app`
* `DB_PASSWORD` to `owox-data-marts-app` user's generated password
* `DB_DATABASE` to `owox-data-marts-db`

**Step 3.** Configure built-in authentication with:

* `IDP_PROVIDER` to `better-auth`
* `IDP_BETTER_AUTH_SECRET` to a unique 32-character key that you can generate via `openssl rand -base64 32` in a local terminal or another method.
* `IDP_BETTER_AUTH_PRIMARY_ADMIN_EMAIL` to email you will use to sign in (something like `your@company.com`)

**Step 4.** Configure logging

* `LOG_FORMAT` to `gcp-cloud-logging`

Example:

```text
PUBLIC_ORIGIN=https://owox-data-marts-312784848198.europe-west1.run.app

DB_TYPE=mysql
DB_HOST=34.41.185.251
DB_PORT=3306
DB_USERNAME=owox-data-marts-app
DB_PASSWORD=PO$sTNkf?TRoY83g
DB_DATABASE=owox-data-marts-db

IDP_PROVIDER=better-auth
IDP_BETTER_AUTH_SECRET=pw/1VHJStJeLThUeFtHoRlKSdRHHIYKPMnYMSO+86bA=
IDP_BETTER_AUTH_PRIMARY_ADMIN_EMAIL=your@company.com

LOG_FORMAT=gcp-cloud-logging
```

**Step 5.** Click `Create` and wait till service will be up.

## Add First Admin

Open `owox-data-marts` service → `Observability` → `Logs`.

Search logs by `Primary admin created` and open corresponding warning.
Follow a magic link from `jsonPayload` → `message`.

Page behind a magic link allows setting up password for email configured in `IDP_BETTER_AUTH_PRIMARY_ADMIN_EMAIL`.

Now you may use that user's email and password to sign in to OWOX Data Marts.

## Update Deployment

Click `Edit & deploy new revision` and click `Deploy`.
