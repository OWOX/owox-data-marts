---
'owox': minor
---

**Plugins show loading in the same bar as OWOX Data Marts**

Plugin authors had to build their own loading indicator, so each plugin showed loading in a
different way. Now a plugin asks the host to show the loading bar that OWOX Data Marts shows at
the top of the page for its own requests.

- `ctx.ui.startLoading()` shows the bar and returns a loading with `setProgress(fraction)` and
  `stop()`.
- The bar stays while any started loading runs. When every running loading sets a fraction, the
  bar shows how much of the work is done.

The change is backward compatible. To use the new member, update `@owox/plugin-sdk` to this
release. On an older OWOX Data Marts deployment, the bar does not show and the calls do not fail.

See [Show the loading bar](../../docs/plugins/authoring-guide.md#show-the-loading-bar).

<!-- markdownlint-disable-file MD041 MD036 -->
