---
'owox': minor
---

**Plugin SDK: links to a plugin's own pages**

`@owox/plugin-sdk` adds three members, so a plugin's pages can be shared by link:

- `ctx.route` — the plugin's own route the member opened, `/` when the link named none.
- `ctx.ui.setRoute(path)` — keeps the browser address on the page the plugin shows.
- `ctx.ui.copyLink(path?)` — copies a link to one of the plugin's pages, the current one by
  default, and the host shows "Link copied".

The change is backward compatible: existing plugins keep working without changes. To use the new
members, update `@owox/plugin-sdk` to this release. On an older OWOX Data Marts deployment
`ctx.route` is always `/`, `setRoute` does nothing and `copyLink` rejects.

See [Make pages shareable](../../docs/plugins/authoring-guide.md#make-pages-shareable).

<!-- markdownlint-disable-file MD041 MD036 -->
