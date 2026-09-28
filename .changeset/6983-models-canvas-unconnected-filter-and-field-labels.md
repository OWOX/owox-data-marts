---
'owox': minor
---

**Find unconnected Data Marts and read field aliases and descriptions on the Models canvas**

The relationships filter on **Data Marts → Models** has a third option, **Without relationships only**: it leaves only the Data Marts that no other visible Data Mart joins to, so the ones still waiting to be connected — or to be cleaned up — stand out instead of hiding among the joined cards. It respects the status filter, and it is part of the page URL (`rel=unconnected`) like the other filters.

![The Models canvas relationships filter open with All Data Marts, With relationships only and Without relationships only, the last one selected and a single unconnected Data Mart left on the canvas](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/ff20092f-b242-4ad6-2ce5-c8e196db5100/w=800)

In the **Detailed** view, each field row now shows the Output Schema **description** under the field, and two new entries in the **Object labels** section of the canvas settings control the rows: **Field descriptions** switches the description line off, and **Field aliases** switches the row text between the Output Schema alias (as before) and the technical field name. Whichever of the two is not shown is available on hover. Both labels are on by default. Long descriptions are cut to one line — hover to read the whole text. The Joinable Data Marts diagram gets the same labels.

![The Models canvas in the Detailed view with the canvas settings open: Field aliases and Field descriptions are ticked under Object labels, and the Orders card lists each field by its alias with its description underneath](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/ce4e911b-1290-4ae2-9efd-29dc24fbae00/w=800)

See [Models Canvas](../../docs/getting-started/setup-guide/models-canvas.md).
