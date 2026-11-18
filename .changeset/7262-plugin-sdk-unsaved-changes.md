---
'owox': minor
---

**Plugins can keep a member from losing unsaved work**

A member stages choices on a plugin screen and then clicks a Data Mart in the sidebar to check a
field. Before, the plugin could not warn the member: a sidebar click, the browser Back button, a
reload or a tab close removed the plugin, and every unsaved choice was lost without a question. Now
the plugin tells OWOX Data Marts that its screen has unsaved changes, and OWOX Data Marts asks the
member before the plugin page closes.

![The Unsaved Changes dialog over the Setup tab of a plugin's Settings page, with the plugin's text "Your Setup choices are not saved." and the buttons "No, stay here" and "Yes, leave now"](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/eeb21807-dc7a-40b4-571f-c01c483f4100/public)

- `ctx.ui.setUnsaved(dirty, message?)` marks the current screen as unsaved. While the flag is set,
  the Unsaved Changes dialog opens before the member leaves through the sidebar, the header, the
  breadcrumbs, the browser Back and Forward buttons, or the plugin's own `ctx.ui.navigate`. A
  reload or a tab close shows the browser's own prompt.
- `message` is plain text, up to 200 characters. It replaces the text of the dialog.
- `ctx.ui.setRoute` to another path clears the flag.

The change is backward compatible. To use the new member, update `@owox/plugin-sdk` to this
release. On an older OWOX Data Marts deployment, the call does nothing and does not fail.

See [Warn about unsaved changes](../../docs/plugins/authoring-guide.md#warn-about-unsaved-changes).

<!-- markdownlint-disable-file MD041 MD036 -->
