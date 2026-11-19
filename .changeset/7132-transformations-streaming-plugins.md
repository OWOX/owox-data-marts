---
'owox': minor
---

**Transformations and GA4 Streaming now live next to your Data Marts: install them as plugins**

An analyst whose Data Marts read tables that scheduled SQL prepares in Google BigQuery had to leave OWOX Data Marts for `bi.owox.com` every time they wanted to check a run, start one or change the SQL. Now **Transformations** is a plugin in the same project: install it from the Plugins Gallery, and the tables your Data Marts read and the SQL that builds them are in one place. **GA4 Streaming**, which sends Google Analytics 4 events to Google BigQuery, is available as a plugin in the same way.

Watch how to install Transformations from the Gallery, read a transformation's operations, variables and triggers, and follow a run step by step in its history.

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/70e17ec1ab7f0b4f47796ddca86b7eff/iframe>

Nothing has to be moved. The plugin opens the transformations your project already has, with their latest runs, schedules and dependencies.

**Where to find the plugins**

- Projects that already used Transformations or GA4 Streaming on `bi.owox.com` have both plugins in the Gallery, marked **Verified**.
- In any other project, add a plugin yourself: open **Plugins**, select **Publish Plugin** and enter `OWOX/transformations-plugin` or `OWOX/streaming-plugin`. Both repositories are public: [OWOX/transformations-plugin](https://github.com/OWOX/transformations-plugin) and [OWOX/streaming-plugin](https://github.com/OWOX/streaming-plugin). A Project Admin can make the plugin findable for everyone in the project; see [Publish and install](../../docs/plugins/authoring-guide.md#publish-and-install).
