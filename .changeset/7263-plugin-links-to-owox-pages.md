---
'owox': minor
---

**Keep your place in a plugin: open its links to OWOX pages in a new tab**

A plugin that shows a Data Mart or a Context could only send you to that page in place of the
plugin. To check a field during setup, or to compare Data Marts, you left the plugin and lost what
you did in it. Now a plugin can show real links to OWOX pages. Open one in a new tab with Cmd-click
(Ctrl-click on Windows and Linux), a middle click or the browser's context menu, and the plugin
stays open. A plain click still opens the page in place.

- `ctx.ui.link(path)` gives `href` and `onClick` for an `<a>` element.
- `ctx.appOrigin` is the origin of the page that runs the plugin, for example
  `https://app.owox.com`.

A plugin shows such links after its author updates `@owox/plugin-sdk` to this release.
`ctx.ui.link` and `ctx.appOrigin` also work on older OWOX Data Marts deployments.

See [Link to OWOX pages](../../docs/plugins/authoring-guide.md#link-to-owox-pages).

<!-- markdownlint-disable-file MD041 MD036 -->
