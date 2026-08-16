# Configure a Self-Managed License Key

A managed license key enables Report Runs on a self-managed OWOX Data Marts deployment and bills their consumption to the OWOX Data Marts Cloud project that issued the key.

This guide covers deployment configuration. To create, rename, rotate, or revoke keys, see [License Keys in Project Settings](../../project/license-keys.md).

## Before you begin

You need:

- a self-managed OWOX Data Marts deployment;
- its public HTTP or HTTPS origin;
- access to an OWOX Data Marts Cloud project;
- a Project Admin who can create a license key in that project.

## 1. Set the public origin

Set `PUBLIC_ORIGIN` to the address where users and integrations reach the deployment. Use only the origin: scheme, hostname, and optional port. Do not include a path.

```env
PUBLIC_ORIGIN=https://data-marts.example.com
```

For local development, the value can include HTTP and a port:

```env
PUBLIC_ORIGIN=http://localhost:3000
```

The value is part of the license validation. A key created for a different origin does not activate the licensed edition.

## 2. Create and copy the key

In OWOX Data Marts Cloud, open **Project Settings → License keys** and create a key whose **Public origin** matches `PUBLIC_ORIGIN`.

Copy the full key when it is revealed. It is displayed only once. For the complete management workflow, see [Create a license key](../../project/license-keys.md#create-a-license-key).

## 3. Configure the deployment

Store the key as a secret and expose it to the application as `LICENSE_KEY`:

```env
PUBLIC_ORIGIN=https://data-marts.example.com
LICENSE_KEY=<full-key-copied-from-owox-data-marts-cloud>
```

Do not commit the key to source control, include it in an image, or print it in logs. Use the secret-management mechanism provided by your hosting platform.

See [Environment Variables](environment-variables.md) for supported ways to pass values to `owox serve`, containers, and hosting platforms.

## 4. Restart and verify

Restart the deployment so it reads the new environment values. Then:

1. Complete a Report Run, such as an HTTP Data request, MCP `query_data_mart` call, or supported report delivery.
2. Return to **Project Settings → License keys** in Cloud.
3. Confirm that **Last activity** is populated for the key.
4. Open the Cloud project's **Credits consumption** page and confirm that the run appears under the key's name and ID.

See [Consumption from licensed self-managed deployments](../billing/consumption-units.md#consumption-from-licensed-self-managed-deployments) for details.

## What the license changes

- Successful Report Runs are authorized through OWOX Data Marts Cloud and charged to the Cloud project that issued the key.
- Report Run consumption includes the license key ID, self-managed project, and deployment origin so Cloud can display it separately from native Cloud usage.
- Process Runs continue to execute on the self-managed deployment and are not sent to Cloud for consumption billing through the license key.
- Without a valid key, the deployment uses the Community edition. Configuration remains available, but Report Runs finish as restricted.

## Rotate or move a deployment

To rotate a key, create the replacement first, update `LICENSE_KEY`, restart and verify a Report Run, and only then revoke the old key. Follow the full [rotation procedure](../../project/license-keys.md#rotate-a-license-key).

If the deployment moves to another origin, update `PUBLIC_ORIGIN` and create a new key for that exact origin. You cannot reuse a key issued for the old address.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Deployment starts as Community | Confirm that `LICENSE_KEY` is present and contains the complete value revealed by Cloud. |
| Log reports a license validation failure | Confirm that `PUBLIC_ORIGIN` exactly matches the key's Public origin, including scheme and port. |
| Report Runs are restricted | Check whether the key is expired or revoked and whether the billing project can authorize the run. |
| Key shows **Last activity: Never** | Restart the deployment after changing the environment, then complete a successful Report Run. |
| Deployment origin changed | Create a new key for the new `PUBLIC_ORIGIN`; the origin of an existing key cannot be edited. |

## Related guides

- [License Keys in Project Settings](../../project/license-keys.md)
- [Consumption Units](../billing/consumption-units.md)
- [Environment Variables](environment-variables.md)
