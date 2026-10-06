---
'owox': minor
---

**Share links to plugins**

A plugin page's **⋮** menu now has **Copy link** as its first item: it copies a link to that
plugin page and shows "Link copied".

A link to a page inside a plugin, `/ui/<project>/plugins/<pluginId>/open<route>`, opens that page
in plugins that support it; a member who has not installed the plugin is offered the install
first. A member's earlier `/plugins/run/<installationId>` links redirect to the new address.

A link written for people outside a project, such as a website or an email, can use `none` in
place of the project id — OWOX opens it in the reader's current project after sign-in.
`/ui/none/plugins/github/<owner>/<repo>` finds a public plugin published for the whole
deployment, case-insensitively; anything else answers "This plugin isn't available here".

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/b9e66bb963f6b3559f1c2f1249a62856/iframe>

See [Link to a plugin](../../docs/plugins/trusted-plugins.md#link-to-a-plugin).

<!-- markdownlint-disable-file MD041 MD036 -->
