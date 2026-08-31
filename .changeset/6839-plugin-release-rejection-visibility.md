---
'owox': minor
---

# Plugin release rejections are now visible, and collection compatibility follows SemVer

When a plugin's GitHub release was rejected during sync, the reason was stored in the database and communicated nowhere: no log line, no audit detail, nothing in the UI. From the outside it looked like "Check now did nothing" — the plugin stayed on an old version with no explanation.

Now every publisher-fixable rejection is visible in three places:

- **Application logs.** Both the daily check and manual "Check now" log a warning per rejected release, e.g. `owner/plugin: v0.1.2 rejected (COLLECTIONS_INCOMPATIBLE) — Collection "dashboards" cannot change entity binding`. Rejections that are permanent by design (drafts, prereleases, non-SemVer tags) stay out of the log so they cannot bury the one line that matters.
- **Audit trail.** The `UPDATE_CHECK` audit record now carries the rejection summary, not only thrown transport errors.
- **Plugin page.** Publishers see a "Release issues" card listing each rejected release with its code, reason, and the time of the check, and "Check now" tells a publisher directly when the fresh check rejected a release instead of reporting "up to date".

The collection-compatibility safeguard is also back, now gated on SemVer: within a compatibility line a release may add collections and change action mappings, but cannot remove a collection or change its name, scope, or entity binding — the previous version stays current and the reason says how to proceed. Opening a new line waives the check, so a breaking collection change ships by declaring itself as one: a major version bump, or a minor bump while the plugin is still below 1.0.0 (where SemVer promises no stability).
