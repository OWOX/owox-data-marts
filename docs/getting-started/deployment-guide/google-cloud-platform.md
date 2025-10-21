# Google Cloud Platform

Deploying OWOX Data Marts on Google Cloud Platform (GCP) relies on two managed services:

- **Cloud SQL for MySQL** – hosts the application database with minimal operational overhead.
- **Cloud Run** – provides a serverless runtime for the application container.

The sections below walk through provisioning these services, configuring application secrets, and performing the first admin sign-in.

## 1. Create the Cloud SQL Instance

1. Open the Cloud SQL creation wizard: <https://console.cloud.google.com/sql/instances/create;engine=MySQL>
2. **Edition**: choose **Enterprise** (sufficient for most workloads) and start with the **Sandbox** preset. You can increase resources later.
3. **Instance info**:
   - **Database version**: `MySQL 8.0`
   - **Instance ID**: `owox-data-marts-db` (or another descriptive name)
   - **Password**: Generate a password for the `root` user and store it securely. The application will not use `root`, but you may need it for maintenance.
4. **Region**: pick the same region you plan to use for Cloud Run.
5. **Machine configuration**: start with `General purpose – Shared core` – `1 vCPU, 1.7 GB RAM`. Monitor usage and scale if needed.
6. **Connections**: for quick setup, you can allow public access by adding the `0.0.0.0/0` network. While this is not the best choice from a security perspective, it can help initial testing; check **I acknowledge the risks**, then replace the rule with a more restricted network as soon as possible.
7. Click **Create instance**. Provisioning can take several minutes; refresh manually if required.
8. After creation, note the following from the **Connect to this instance** section:
   - **Public IP address** (for example `136.113.41.46`)
   - **Default TCP port** (typically `3306`)

<https://github.com/user-attachments/assets/9d9a5474-4ff6-4c24-b979-b06be77ca2f4>

### Create the Application Database

1. Within the instance, open the **Databases** tab.
2. Click **Create database** and set **Database name** to `owox-data-marts-db`
3. Click **Create**.

### Create the Application User

1. Switch to the **Users** tab and click **Add user account**.
2. Choose **Built-in authentication** and enter:
   - **User name**: `owox-data-marts-app`
   - **Password**: generate a strong password and store it securely.
3. Click **Add**.

<https://github.com/user-attachments/assets/ea398e16-c571-44d0-9003-625bd517d60d>

## 2. Deploy the Cloud Run Service

1. Launch the Cloud Run deployment wizard: <https://console.cloud.google.com/run/create?enableapi=true&deploymentType=container>.
2. **Container image URL**: `us-docker.pkg.dev/owox-registry/ghcr/owox/owox-data-marts:latest`.
3. **Service name**: choose a descriptive name, e.g. `owox-data-marts`.
4. **Region**: select the same region as the Cloud SQL instance.
5. Copy the generated **Endpoint URL** and store it; it becomes your `PUBLIC_ORIGIN`.
6. **Authentication**: select `Allow public access`. OWOX Data Marts provides built-in authentication.
7. **Billing**: choose `Instance-based`.
8. **Service scaling**: set to `Manual scaling` and keep **Number of instances** at `1`. OWOX Data Marts requires at least one instance running continuously to enable scheduled scenarios.
9. **Ingress**: set to `All`.

### Configure Container Settings

Under **Containers, Volumes, Networking, Security** / **Containers** → **Settings**:

- **Memory**: `1GiB`
- **CPU**: `1`
- **Execution environment**: `Second generation`

### Configure Environment Variables

Open **Containers, Volumes, Networking, Security** / **Containers** → **Variables & Secrets** and add the variables below. Replace the placeholder values with the credentials collected in earlier steps:

- `PUBLIC_ORIGIN`: use the Cloud Run endpoint, e.g. `https://owox-data-marts-312784848198.europe-west1.run.app`. Ensure there is no trailing slash.

- `DB_TYPE`: `mysql`
- `DB_HOST`: Cloud SQL public IP address
- `DB_PORT`: Cloud SQL port (default `3306`)
- `DB_USERNAME`: `owox-data-marts-app`
- `DB_PASSWORD`: the password generated for `owox-data-marts-app` Application User
- `DB_DATABASE`: `owox-data-marts-db`

- `IDP_PROVIDER`: `better-auth`
- `IDP_BETTER_AUTH_SECRET`: a unique 32-character secret. Generate one locally, e.g. `openssl rand -base64 32`.
- `IDP_BETTER_AUTH_PRIMARY_ADMIN_EMAIL`: the email for the first admin user, e.g. `your@company.com`.

- `LOG_FORMAT`: `gcp-cloud-logging`

🏁 When all variables are in place, click **Create** and wait for the deployment to finish.

Example configuration block (do not reuse as-is):

```text
PUBLIC_ORIGIN=https://owox-data-marts-312784848198.europe-west1.run.app

DB_TYPE=mysql
DB_HOST=136.113.41.46
DB_PORT=3306
DB_USERNAME=owox-data-marts-app
DB_PASSWORD=PO$sTNkf?TRoY83g
DB_DATABASE=owox-data-marts-db

IDP_PROVIDER=better-auth
IDP_BETTER_AUTH_SECRET=pw/1VHJStJeLThUeFtHoRlKSdRHHIYKPMnYMSO+86bA=
IDP_BETTER_AUTH_PRIMARY_ADMIN_EMAIL=your@company.com

LOG_FORMAT=gcp-cloud-logging
```

<https://github.com/user-attachments/assets/b8bb0314-397a-44c2-8158-f0316370a34b>

## 3. Create the First Admin User

1. Open the newly created Cloud Run service.
2. Navigate to **Observability** → **Logs**.
3. Search for log entries containing `Primary admin created`.
4. Open the matching log line and copy the magic link from `jsonPayload.message`.
5. Follow the link to set a password for the email specified in `IDP_BETTER_AUTH_PRIMARY_ADMIN_EMAIL`.
6. Sign in to OWOX Data Marts with that email and password.

## 4. Rollout Updates

When a new OWOX Data Marts release is available, or you need to adjust the application configuration:

1. Open the Cloud Run service.
2. Click **Edit & deploy new revision**.
3. Update the container image to the desired OWOX Data Marts tag (the `latest` tag documented above already tracks the newest release) and adjust settings or variables if required.
4. Click **Deploy** to roll out the update.
