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

Nothing else needs to be enabled. The **Plugins** section appears in a project's sidebar as soon
as its Gallery has at least one installable plugin, so the first deployment publication is also
what makes the section visible everywhere.

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

Members see a link to the plugin's repository on its page, and anyone can follow it. Before
publishing deployment-wide, make sure the repository's default branch and README describe the
plugin as it is actually released.

## Withdraw or suspend

Unpublishing removes the listing and nothing else — nobody is uninstalled, members who already
installed the plugin keep it, and publishing again restores the same listing:

```bash
owox-ctl plugins unpublish OWNER/PLUGIN_NAME --scope deployment
```

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
