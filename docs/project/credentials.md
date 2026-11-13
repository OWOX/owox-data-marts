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
another Credential. Destinations work the same way: access is checked when a member selects
the Credential, and runs check only that it is enabled and usable.

## Plugin use

A plugin release declares each Credential capability it needs. During installation, the member
explicitly selects a compatible project Credential for every required capability and may choose
not to grant an optional one. The plugin receives a handle that can make approved requests; the
raw secret never enters its frame.

A plugin that needs AI can use [OWOX AI](#owox-ai) instead of a Credential.

The **Used by** section shows active consumer bindings and when each binding last succeeded. The
Credential list also shows aggregate last use. A Credential with active bindings cannot be deleted;
disable it to stop use immediately, or first switch its Storages and Destinations to another
Credential and uninstall the plugins that use it. Replacing a secret keeps the bindings and
consumers use the new value on their next request.

### OWOX AI

OWOX AI is an AI provider that comes with OWOX Data Marts. A plugin that needs AI can use it
instead of an AI Credential. You do not need an account or an API key from an AI provider, and
you do not get a separate bill from one.

- **Where you choose it.** For a plugin that needs AI, the install dialog shows OWOX AI first in
  the **AI** field. It selects OWOX AI when OWOX AI provides every model that the plugin needs.
  You can change the choice at any time on the plugin's **Credentials** tab, to OWOX AI or to an
  AI Credential of the project.
- **Who provides the AI models.** On OWOX Data Marts Cloud, OWOX provides them. On a self-managed
  deployment, the operator connects an AI provider.
- **What the plugin gets.** The plugin sends its AI requests through OWOX Data Marts. It never
  gets an API key, and it cannot see which AI provider or model answers.
- **Which models.** OWOX AI can provide `fast`, `reasoning`, `embedding`, and `decision`. A plugin
  uses `decision` to [choose from a fixed list](../plugins/authoring-guide.md#choose-from-a-fixed-list).
  The deployment turns on `decision` separately from the other models. Each decision question
  needs `instructions`, and the state is text or JSON only.

#### Credits

On OWOX Data Marts Cloud, OWOX AI uses the credits of the project:

- Each successful OWOX AI call counts as one
  [AI Process Run](../getting-started/billing/consumption-units.md#process-run). One AI Process
  Run includes up to 50,000 tokens (input and output). Each next 50,000 tokens of the same call
  counts as one more AI Process Run.
- A call that fails does not count.
- Before each call, OWOX Data Marts checks that the project can run AI Process Runs. If the project
  is blocked, for example because it went over its overdraft limit, OWOX AI calls fail until the
  block is removed.
- The **Credits consumption** page shows OWOX AI usage in a row with the context type **Plugin**
  and the name of the plugin.
- For the price of credits, see the [Pricing page](https://www.owox.com/pricing#credits).

Calls through an AI Credential of the project do not use credits; your AI provider bills you
directly. On a self-managed deployment, OWOX AI calls do not use credits; the operator pays the AI
provider.

## Storage and Destination providers

Storages and Destinations select a Credential instead of holding a key; see
[Credentials for Storages](../storages/manage-storages.md#credentials-for-storages) and the
[Google Sheets](../destinations/supported-destinations/google-sheets.md) and
[Google Chat](../destinations/supported-destinations/google-chat.md) Destinations. These
providers fit them:

| Provider                          | Fits                                               | You enter                                                |
| --------------------------------- | -------------------------------------------------- | -------------------------------------------------------- |
| Google Service Account            | Google BigQuery Storage, Google Sheets Destination | The JSON key                                             |
| BigQuery Google account           | Google BigQuery                                    | Nothing; click **Connect with Google**                   |
| Sheets Destination Google account | Google Sheets Destination                          | Nothing; click **Connect with Google**                   |
| Google Chat webhook               | Google Chat Destination (webhook delivery)         | Webhook URL                                              |
| AWS access key                    | AWS Athena, AWS Redshift                           | Access key ID, Secret access key, optional Session token |
| Snowflake password                | Snowflake                                          | Username, Password (or a Programmatic Access Token)      |
| Snowflake key pair                | Snowflake                                          | Username, Private key, optional Private key passphrase   |
| Databricks token                  | Databricks                                         | Personal access token                                    |

Secret fields are write-only like any secret. To replace one, enter a new value; fields you leave
out keep theirs, and the form warns how many Storages and Destinations the change applies to. Before
saving, OWOX Data Marts checks the new values against each Storage and Destination that uses the
Credential where a check exists: a Storage must connect, Google Sheets must accept a service account
key (the Drive folder is not checked), and a Google Chat webhook URL must be a Google Chat incoming
webhook. If one of them fails, nothing is saved; the error names that Storage or Destination if you
can see it. A changed **Access key ID** or **Username** is checked the same way. It also needs the
stored secrets entered again, so they never follow a new identity: without them, saving answers, for
example, "Enter Password again to change Username". Replacing values needs the right to maintain the
Credential, not the right to edit the Storages and Destinations that
use it. A Credential created from a Storage or Destination form is not shared: only its owners and
Project Admins can use it until an owner shares it. Plugins cannot request these providers, except Google
Service Account.

## Source providers

A Connector Data Mart selects a Credential in the **Credential** field of each configuration instead of holding a key. **+ Create new Credential** opens the Credential form beside the configuration with the provider chosen and selects the new Credential on save. With exactly one fitting Credential, a new configuration selects it for you. Fields that pick data, such as account IDs, stay in the configuration. The Credentials page groups the providers:

| Group             | Providers                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| Ads               | Criteo Ads, Facebook Ads, Google Ads, LinkedIn Ads, Microsoft Ads, Reddit Ads, TikTok Ads, X Ads |
| Social            | LinkedIn Pages                                                                                   |
| E-commerce        | Shopify                                                                                          |
| Currencies        | Open Exchange Rates                                                                              |
| Google            | Sheets Source Google account                                                                     |
| Other             | GitHub                                                                                           |
| Custom connectors | Custom connector                                                                                 |

Google Ads has a second provider, **Google Ads service account**, for its service account variant. A Google Sheets Source with a service account key uses a **Google Service Account** Credential. Bank of Canada and Open Holidays need no key and have no provider. Each connector's page tells how to get its keys; see [Add Access Credentials](../getting-started/setup-guide/connector-data-mart.md#step-3-add-access-credentials).

For a connector with its own sign-in, the Credential form offers **Connect** where the deployment has that sign-in set up, and the values typed by hand otherwise or when you choose **Manually**. A **Sheets Source Google account** Credential opens the Google Picker on connect; its page has **Add spreadsheet**, and the Data Mart lists the spreadsheets the Credential can open. On a self-managed install, Connect and the spreadsheet list need the settings in [Google Sheets Source sign-in](../getting-started/deployment-guide/environment-variables.md#google-sheets-source-sign-in).

Selecting a Credential for a configuration needs the right to use it, and so does loading the fields and options of a configuration; a member who can edit the Data Mart keeps loading those for the Credential it already uses. Running needs only that the Credential is enabled and fits. Replacing a Credential's values changes every Data Mart listed under **Used by**. The new values are not checked against those Data Marts, so a wrong value shows up on their next runs. Data Marts that share a Credential with a rotating refresh token share the rotated token.

### Custom connector Credentials

A **Custom connector** Credential holds the keys of one API for custom connectors. Its **hosts** and its list of fields (name, label, secret or not) are set when it is created and cannot be changed afterwards; create a new Credential for other hosts. Whoever maintains it can replace its values. It fits a connector by content, not by name: it holds every host the connector's manifest sends requests to and a value for every required key parameter (of the branch a `selective` authentication selects). One Credential therefore serves several connectors of the same API, and works in the [Connector Builder](../connectors/connector-builder.md) before the connector is saved. See [Key parameters](../connectors/manifest-reference.md#key-parameters).

### Sheets Destination Google account

A **Sheets Destination Google account** Credential connects a Google account for Google Sheets Destinations. It
works like a [BigQuery Google account](#bigquery-google-account): click **Connect with Google**, and
reconnect from the Credential when Google revokes the access. It is available only where the
deployment has Google OAuth for Destinations set up; without it, Destinations that use one show
**Google sign-in is not configured on this server** and do not run. The Google Drive permission
(`drive.file`) is optional: without it, reports still write, and **Create document** puts the
spreadsheet in the account's Drive root, outside the selected folder and not shared with you.

### Google Chat webhook

A **Google Chat webhook** Credential holds the incoming webhook URL of a Google Chat space. Paste it
in the **Webhook URL** field; OWOX accepts only Google Chat incoming webhook URLs and never shows the
URL again. Google Chat Destinations use it for webhook delivery; email delivery keeps its recipients on
the Destination.

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

### Used by Storages, Destinations and Data Marts

**Used by** lists the Storages, Destinations and Data Marts that use the Credential. A Destination you cannot
access appears as **A Destination you cannot access**. A Credential used by a Storage, a Destination or a Data Mart
cannot be deleted: switch those to another Credential first. Disable the
Credential to stop them at once; they show **Credential disabled** until it is enabled again.

## Google Service Account

A Google Service Account Credential lets a plugin call Google APIs, such as Google Docs and Google
Sheets, as a service account, and lets a BigQuery Storage run queries and a Google Sheets Destination write reports as one:

1. In Google Cloud, create a service account and a JSON key for it; see
   [Create and delete service account keys](https://docs.cloud.google.com/iam/docs/keys-create-delete).
   Organizations created on or after May 3, 2024 block key creation by default with
   `iam.managed.disableServiceAccountKeyCreation`; an organization admin has to allow it.
2. Enable the API the plugin uses, such as the Google Docs API or the Google Sheets API, in the
   project the key belongs to.
3. Create a Credential with the **Google Service Account** provider and paste the key or drop the
   JSON file. OWOX Data Marts asks Google for a token before saving and refuses a key Google
   rejects. A new key can take about a minute to start working.
4. Share each document or spreadsheet the plugin should change with the service account address
   shown on the Credential, as Editor.

Use a dedicated service account with no project roles: a plugin reaches whatever the account can
reach within the scopes it declares. A replacement key must belong to the same service account;
create another Credential for a different one. Access tokens Google already issued stay valid for
up to an hour after a key is disabled or deleted; disable the service account to revoke them.

## AI mappings

An AI-capable Credential maps logical `fast`, `reasoning`, `embedding`, and `decision` capabilities
to provider model IDs. A mapping can follow the definition's recommended model or override it with a fixed
provider model ID. Recommended mappings follow compatible definition updates automatically;
overrides stay unchanged. If an override selected from the definition catalog later disappears,
consumers that require it need setup again.

An advanced manual model ID remains a deliberate manual
override and does not depend on catalog membership.

Only OpenAI, Gemini, and Anthropic Credentials can map `decision`, the model that a plugin uses
to [choose from a fixed list](../plugins/authoring-guide.md#choose-from-a-fixed-list). Existing
Credentials of these three providers have `decision` with the recommended model. A plugin that
declares `decision` then sends its data to the provider with the key of the Credential. To turn
it off, set **Decision model** to **Not configured** in the Credential form.

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
