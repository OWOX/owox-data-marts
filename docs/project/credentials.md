# Credentials

Credentials are reusable, project-owned secrets for external services. A project member saves a
provider key once, then grants the Credential to plugin installations without copying the secret
into plugin settings or plugin code.

Open **Credentials** from the project sidebar to create and manage them. Choose a provider, enter a
name and secret, set owners and contexts, and decide whether other project members may use or
maintain the Credential. The secret is write-only: it can be replaced, but it is never displayed
after saving.

## Ownership and access

A Credential belongs to the project, not to the member who created it. The creator is recorded for
audit and becomes the first owner, but removing that member from the project does not disable the
Credential or stop consumers that already use it. At least one owner must remain.

Owners and Project Admins can manage the Credential. The **Shared for use** and **Shared for
maintenance** settings add access for other eligible project members, subject to their role scope
and assigned contexts. Plugins re-check access, status, and definition compatibility whenever
they use a Credential. Storages check access when a member selects the Credential or changes where
the Storage connects; runs check only that the Credential is enabled and usable, because running
needs access to the Storage only. Turning sharing off therefore leaves bound Storages running:
disable the Credential to stop them, and members who can edit those Storages switch them to
another Credential.

## Plugin use

A plugin release declares each Credential capability it needs. During installation, the member
explicitly selects a compatible project Credential for every required capability and may choose
not to grant an optional one. The plugin receives a handle that can make approved requests; the
raw secret never enters its frame.

The **Used by** section shows active consumer bindings and when each binding last succeeded. The
Credential list also shows aggregate last use. A Credential with active bindings cannot be deleted;
disable it to stop use immediately, or first switch its Storages to another Credential and uninstall
the plugins that use it. Replacing a secret keeps the bindings and consumers use the new value on
their next request.

## Storage providers

Storages select a Credential instead of holding a key; see
[Credentials for Storages](../storages/manage-storages.md#credentials-for-storages). These
providers fit Storages:

| Provider                 | Fits Storage             | You enter                                                |
| ------------------------ | ------------------------ | -------------------------------------------------------- |
| BigQuery Service Account | Google BigQuery          | The JSON key                                             |
| BigQuery Google account  | Google BigQuery          | Nothing; click **Connect with Google**                   |
| AWS access key           | AWS Athena, AWS Redshift | Access key ID, Secret access key, optional Session token |
| Snowflake password       | Snowflake                | Username, Password (or a Programmatic Access Token)      |
| Snowflake key pair       | Snowflake                | Username, Private key, optional Private key passphrase   |
| Databricks token         | Databricks               | Personal access token                                    |

Secret fields are write-only like any secret. To replace one, enter a new value; fields you leave
out keep theirs, and the form warns how many Storages the change applies to. Before saving, OWOX
Data Marts checks the new values against each Storage that uses the Credential. If one of them
cannot connect with the new values, nothing is saved; the error names that Storage if you can see
it. A changed **Access key ID** or **Username** is checked the same way. Replacing values needs
the right to maintain the Credential, not the right to edit the Storages that use it. A Credential
created from a Storage form is not shared: only its owners and Project Admins can use it until an
owner shares it. Plugins cannot request these providers, except BigQuery
Service Account.

### BigQuery Google account

A **BigQuery Google account** Credential connects a Google account for BigQuery. Choose the provider
and click **Connect with Google**; the account's email becomes the Credential's identity. When
Google revokes the access or it expires, the Storages that use the Credential show that it needs
reconnecting: open the Credential and click its Google button, **Authenticated as** or **Connect
with Google**, to connect the account again. The button is disabled while the form has unsaved
changes; save or discard them first. Reconnecting with a different Google account is refused; create
a new Credential for that account. The provider is available only where the deployment has Google
OAuth set up. Without that setup, Storages that use a BigQuery Google account Credential show
**Google sign-in is not configured on this server** and do not run.

Deleting or reconnecting a BigQuery Google account Credential does not revoke the access the Google
account granted, and neither does a refused connect. To remove the access, open [Third-party apps &
services](https://myaccount.google.com/connections) in that Google account and remove the app's
access. This stops every Credential and Storage that uses that Google account.

### Used by Storages

**Used by** lists the Storages that use the Credential. A Credential used by a Storage cannot be
deleted: switch those Storages to another Credential first. Disable the Credential to stop its
Storages at once; they show **Credential disabled** until it is enabled again.

## BigQuery Service Account

A BigQuery Service Account Credential lets a plugin call Google APIs, such as Google Docs and Google
Sheets, as a service account, and lets a BigQuery Storage run queries as one:

1. In Google Cloud, create a service account and a JSON key for it; see
   [Create and delete service account keys](https://docs.cloud.google.com/iam/docs/keys-create-delete).
   Organizations created on or after May 3, 2024 block key creation by default with
   `iam.managed.disableServiceAccountKeyCreation`; an organization admin has to allow it.
2. Enable the API the plugin uses, such as the Google Docs API or the Google Sheets API, in the
   project the key belongs to.
3. Create a Credential with the **BigQuery Service Account** provider and paste the key or drop the
   JSON file. OWOX Data Marts asks Google for a token before saving and refuses a key Google
   rejects. A new key can take about a minute to start working.
4. Share each document or spreadsheet the plugin should change with the service account address
   shown on the Credential, as Editor.

Use a dedicated service account with no project roles: a plugin reaches whatever the account can
reach within the scopes it declares. A replacement key must belong to the same service account;
create another Credential for a different one. Access tokens Google already issued stay valid for
up to an hour after a key is disabled or deleted; disable the service account to revoke them.

## AI mappings

An AI-capable Credential maps logical `fast`, `reasoning`, and `embedding` capabilities to provider
model IDs. A mapping can follow the definition's recommended model or override it with a fixed
provider model ID. Recommended mappings follow compatible definition updates automatically;
overrides stay unchanged. If an override selected from the definition catalog later disappears,
consumers that require it need setup again. An advanced manual model ID remains a deliberate manual
override and does not depend on catalog membership.

## External definitions

Built-in definitions cover common providers. A maintainer may also add a declarative Credential
definition from a public or deployment-accessible private GitHub repository. Private definitions
use the same configured GitHub access as private plugins. OWOX reads immutable release versions
and checks for updates daily. See
[Credential definitions](../plugins/credential-definitions.md) for the authoring contract.

Compatible updates within the accepted version line become current automatically. A new
compatibility line requires explicit maintainer consent before runtime use resumes. If GitHub is
unavailable or a release is invalid, the last accepted version remains active.

Provider validation is optional and informational. A definite authentication rejection prevents a
new or replacement secret from being saved; an unavailable or inconclusive probe does not.

Credentials use the same product database and behavior in OWOX Cloud and self-managed deployments;
there is no separate Credential encryption or vault configuration in this feature.
