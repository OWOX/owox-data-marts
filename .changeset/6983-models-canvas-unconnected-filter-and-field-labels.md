---
'owox': minor
---

**Find unconnected Data Marts and read field aliases and descriptions on the Models canvas**

The relationships filter on **Data Marts → Models** has a third option, **Without relationships only**: it leaves only the Data Marts that no other visible Data Mart joins to, so the ones still waiting to be connected — or to be cleaned up — stand out instead of hiding among the joined cards. It respects the status filter, and it is part of the page URL (`rel=unconnected`) like the other filters.

![The Models canvas relationships filter open with All Data Marts, With relationships only and Without relationships only, the last one selected and only the two unconnected Data Marts left on the canvas](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/886b39e4-1ba3-40ef-a149-82cad1a93b00/w=800)

In the **ERD** view, each field row now shows the Output Schema **description** under the field, and two new entries in the **Field rows** section of the canvas settings control the rows: **Field descriptions** switches the description line off, and **Field aliases** switches the row text between the Output Schema alias (as before) and the technical field name. Whichever of the two is not shown is available on hover. Both labels are on by default. Long descriptions are cut to one line — hover to read the whole text. The Joinable Data Marts diagram gets the same labels.

![The Models canvas in the ERD view with the canvas settings open: Field aliases and Field descriptions are ticked under Field rows, and the Orders card lists each field by its alias with its description underneath](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/47982d30-4f37-460b-b67b-4e0a517e3f00/w=800)

See [Models Canvas](../../docs/getting-started/setup-guide/models-canvas.md).

<!-- markdownlint-disable-file MD041 MD036 -->
