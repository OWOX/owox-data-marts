# Trusted plugins for the whole deployment

Use this guide to make selected plugins available in every project of an OWOX Data Marts
deployment. It is written for the deployment operator; plugin authors publish for themselves or
their project with the [authoring guide](./authoring-guide.md) instead.

## What a deployment publication is

A publication has one of three scopes: a member publishes for themselves, a Project Admin
publishes for one project, and a deployment publisher publishes for a chosen audience of
projects — or for all of them. A deployment publication is what the Gallery renders as
**Verified**: the badge tells members that the listing was made at the product level, not by a
teammate.

Publishing with the all-projects audience makes the plugin findable in every current and future
project. The audience is indivisible: individual projects cannot be excluded from it. When a
narrower rollout is enough, name the projects instead and widen later.

Nothing else needs to be enabled. The **Plugins** section appears in a project's sidebar once its
Gallery has an installable plugin, or a member there already has a plugin installed or one they can
restore; the first deployment publication is what makes the section visible everywhere.

## Authorize a publisher key

Deployment publishing is restricted to API keys named in
`OWOX_DEPLOYMENT_PLUGIN_PUBLISHER_API_KEY_IDS`. A browser session can never publish at deployment
scope — only an allowlisted key can, so this environment variable is the whole authorization
model.

1. Create an API key for the account that will act as the publisher: **Project settings → My API
   Keys**. See [API Keys](../api/api-keys.md). The key's own project is recorded in the audit
   trail; publications themselves are deployment-wide.
2. Put the API Key ID into the deployment environment, comma-separated when there are several:

   ```bash
   OWOX_DEPLOYMENT_PLUGIN_PUBLISHER_API_KEY_IDS=key_id_1,key_id_2
   ```

3. Restart the deployment so the new value is read.

An unset or blank variable denies deployment publishing to everyone; it never means "any key".
The same allowlist also authorizes the emergency controls below.

## Publish for every project

Configure [`owox-ctl`](../api/owox-ctl.md) with the allowlisted key, then publish by repository:

```bash
owox-ctl plugins publish OWNER/PLUGIN_NAME --scope deployment --all-projects
```

For a limited audience, name the projects instead — the flag repeats:

```bash
owox-ctl plugins publish OWNER/PLUGIN_NAME --scope deployment --project-id PROJECT_ID
```

Publishing also synchronizes the repository's GitHub Releases, so the highest eligible version
becomes current immediately. The command's JSON response includes the publisher diagnostics;
if a release was refused, the `rejections` array says why.

The two audience forms do not mix. Switching between selected projects and all-projects is a
deliberate two-step: unpublish the deployment listing first, then publish again with the other
form.

## Verify the rollout

Check a project that had no plugins before:

1. The **Plugins** section appears in the sidebar.
2. The plugin is in the Gallery with the **Verified** badge and the expected current version.
3. Install it and open it once with a regular member account.

For a public repository, members see a link to it on the plugin page, and anyone can follow it;
a private repository is shown as **Private repository** with no link. Before publishing a public
repository deployment-wide, make sure its default branch and README describe the plugin as it is
actually released.

## Link to a plugin

Links written for people outside a project, such as a website or an email, use `none` in place of
the project id; OWOX opens them in the reader's current project after sign-in:

- `https://app.owox.com/ui/none/plugins/<pluginId>` — the plugin page.
- `https://app.owox.com/ui/none/plugins/github/<owner>/<repo>` — the same page found by a public
  repository published at deployment scope to the reader's project (all projects, or a selected
  audience that includes it), case-insensitive; anything else answers "This plugin isn't
  available here".
- `…/open<route>` after either form — a page inside the plugin.

An `…/open` link offers the install first to a reader who has not installed the plugin: a dialog when
the plugin is listed for them, a banner with an Install button when it is not. The plugin page alone
offers neither.

## Withdraw or suspend

Unpublishing removes the listing and nothing else — nobody is uninstalled, members who already
installed the plugin keep it, and publishing again restores the same listing:

```bash
owox-ctl plugins unpublish OWNER/PLUGIN_NAME --scope deployment
```

A member who no longer wants the plugin uninstalls it from its menu in the sidebar, as described
in [Uninstall or restore](./authoring-guide.md#uninstall-or-restore).

For an emergency there is suspension, which blocks opening, installing and restoring across the
whole deployment while uninstalling and updating stay available:

```bash
owox-ctl plugins suspend OWNER/PLUGIN_NAME --note "why, for the audit trail"
owox-ctl plugins resume OWNER/PLUGIN_NAME
```

To review what is currently published at deployment level:

```bash
owox-ctl plugins publications list --scope deployment
```

## OWOX BI plugins

Some plugins need more than the default sandbox allows: to open popups, use the clipboard, or call
OWOX with the signed-in member's own rights. A deployment operator can mark such plugins as OWOX BI
plugins. The mark is independent of publication: publication decides who sees a plugin, this mark
decides what it may technically do. A plugin does not need to be published at deployment scope to
carry it, and a Verified plugin does not get it automatically.

A plugin is an OWOX BI plugin only when both of these match:

- its GitHub repository id is in `OWOX_BI_PLUGIN_REPOSITORY_IDS`;
- the origin of its delivery URL is in `OWOX_BI_PLUGIN_ORIGINS`.

An unset or blank variable means no plugin is an OWOX BI plugin; it never means "any". The
deployment's own public origin is never accepted.

1. Find the numeric repository id:

   ```bash
   gh api repos/OWNER/NAME --jq .id
   ```

2. Put both variables into the deployment environment, comma-separated when there are several:

   ```bash
   OWOX_BI_PLUGIN_REPOSITORY_IDS=123456789
   OWOX_BI_PLUGIN_ORIGINS=https://plugins.example.com
   ```

3. Restart the deployment so the new values are read.

For such a plugin the host page opens the iframe with `allow-same-origin` and `allow-popups` in its
sandbox, grants the clipboard, and lets the plugin ask for the member's access token with
`ctx.userToken()`. Every other plugin keeps the default sandbox and never receives a token.

The code of an OWOX BI plugin acts with the member's rights. List only plugins you own, served from
hosting you control.
