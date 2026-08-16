# License Keys

License keys connect self-managed OWOX Data Marts deployments to an OWOX Data Marts Cloud project. A key authorizes Report Runs from one deployment origin and charges their consumption to the Cloud project that issued it.

Open **Project Settings → License keys** to view and manage the keys issued by the current project.

> The License keys page is available in OWOX Data Marts Cloud. A self-managed deployment uses a key created there; it does not issue keys itself.

## Permissions

Only Project Admins can create and manage license keys. Other project members can view active keys and their metadata. See [Roles and Permissions](roles-and-permissions.md) for more information about project roles.

## Create a license key

1. Open **Project Settings → License keys**.
2. Click **Create license key**.
3. Enter a name that identifies the deployment, such as `Production` or `Staging`.
4. Enter the deployment's **Public origin**, including the scheme and optional port, for example `https://data-marts.example.com`.
5. Click **Create**.
6. Copy the revealed license key and store it securely.

The Public origin must match the deployment's `PUBLIC_ORIGIN`. Use `http://localhost:3000` only for local development.

> The full license key is shown once, immediately after creation. OWOX does not store a retrievable copy. If you lose it, create a replacement and revoke the old key.

Continue with [Configure a Self-Managed License Key](../getting-started/deployment-guide/license-key-setup.md) to activate the key on the deployment.

## Understand the key list

The License keys table provides the information needed to identify and audit each deployment:

| Field | Description |
| --- | --- |
| **Name** | Human-readable deployment name. Project Admins can change it without replacing the key. |
| **License key ID** | Non-secret UUID used in consumption details, logs, and support requests. |
| **Public origin** | The single deployment origin authorized by the key. |
| **Expires** | The key's expiration date. New keys are valid for 365 days. |
| **Created** | When the key was created. |
| **Last activity** | When the key was last successfully used by its self-managed deployment, or **Never** if it has not been used. |
| **Created by** | Project member who created the key. |

Select a row to review its details. Project Admins can also rename or revoke the key from this view.

## Rotate a license key

Rotate a key before it expires or whenever its secret may have been exposed:

1. Create a new key for the same Public origin.
2. Replace `LICENSE_KEY` on the self-managed deployment and restart it.
3. Complete a Report Run and confirm that **Last activity** appears for the new key.
4. Revoke the old key.

This order prevents an interruption in Report Runs. To move a deployment to another origin, create a new key for the new `PUBLIC_ORIGIN`; an existing key's origin cannot be changed.

## Revoke a license key

Open the key details and select **Revoke license key**. Revocation is immediate and cannot be undone. A deployment still using the key can keep its configuration, but its Report Runs become restricted.

Revocation does not remove consumption that was already recorded. See [Consumption from licensed self-managed deployments](../getting-started/billing/consumption-units.md#consumption-from-licensed-self-managed-deployments) to understand how usage appears in the Cloud project.

## Related guides

- [Configure a Self-Managed License Key](../getting-started/deployment-guide/license-key-setup.md)
- [Consumption Units](../getting-started/billing/consumption-units.md)
- [Environment Variables](../getting-started/deployment-guide/environment-variables.md)
