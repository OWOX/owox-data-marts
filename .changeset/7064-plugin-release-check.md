---
'owox': minor
---

**Check a plugin release before you create it**

`owox-ctl plugins check OWNER/PLUGIN_NAME --ref <branch, tag, or commit SHA>` runs the release rules a GitHub Release from that commit would face: manifest, collection compatibility, delivery URL, and Credential definitions. It lists every failed rule it can evaluate with the same code and detail that release sync records, and exits with code 1 when there are issues. The API is `POST /api/plugins/check`.

- Nothing is recorded: no version, no change to the current version, no sync report. The check does not delay **Check and Update** or the daily check.
- Without `--version`, the candidate is the next version in the current line: the next patch below `1.0.0`, the next minor from `1.0.0`. Without `--version`, a plugin with no current version gets no collection compatibility check.
- Only deployment publishers and members who manage a publication of the plugin can run it. A plugin can be checked once per sync interval.

See [Update or roll back](../../docs/plugins/authoring-guide.md#update-or-roll-back).

<!-- markdownlint-disable-file MD041 MD036 -->
