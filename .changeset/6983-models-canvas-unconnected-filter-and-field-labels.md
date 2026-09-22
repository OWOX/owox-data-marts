---
'owox': minor
---

# Find unconnected Data Marts and read field aliases and descriptions on the Models canvas

The relationships filter on **Data Marts → Models** has a third option, **Without relationships only**: it leaves only the Data Marts that no other visible Data Mart joins to, so the ones still waiting to be connected — or to be cleaned up — stand out instead of hiding among the joined cards. It respects the status filter, and it is part of the page URL (`rel=unconnected`) like the other filters.

In the **Detailed** view, the field rows now show the technical field name and, under it, the Output Schema **alias** (when it differs from the name) and **description**. Two new entries in the **Object labels** section of the canvas settings, **Field aliases** and **Field descriptions**, switch those lines off again; both are on by default. Long descriptions are cut to one line — hover to read the whole text. The Joinable Data Marts diagram gets the same labels.

See [Models Canvas](../../docs/getting-started/setup-guide/models-canvas.md).
