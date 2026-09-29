---
'owox': minor
---

**Clearer Data Mart cards and canvas settings on the Models canvas**

Cards on **Data Marts → Models** now match the Data Mart cards on the OWOX website. Each card leads with an icon and the title, then short badges for the input source, the field count, and the number of triggers, reports and relationships. The badges share a line while they fit, and a count of zero shows no badge. The footer keeps the Data Quality and Data Last Updated indicators and shows when the Data Mart is shared for reporting or for maintenance. Hover a sharing icon to see what it allows.

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/18c996a4099c5a7651bc9626d179bdb3/iframe>

- Click **N relationships** to list the Data Marts this one joins or is joined by, with the join fields. The count and the list cover the whole storage, whatever the canvas filters hide.
- Click **N fields** in Compact mode to list the Output Schema fields under the card.
- Only unpublished Data Marts carry a status badge, **Draft**, next to the title. Published ones no longer show a Published label.
- The colored Data Quality bar on the left edge of the card is gone. The Data Quality shield in the footer shows the status, and hovering it explains the result.

The canvas settings (the gear button) have a new design, and every checkbox hides exactly what it names:

- **View** is picked from two cards with a small preview of each. **Horizontal** / **Vertical** and **Show join fields** sit on one row below them.
- **Card content** has a checkbox for each part of a card: Input source, Fields, Triggers, Reports, Relationships, Draft badge, and Quality and sharing. **Title only** unticks every checkbox, Field rows included, and leaves only the titles. **Show all** ticks everything back on.
- Hover an option to see an info icon with a tooltip that explains it.
- **Field rows** holds Field aliases and Field descriptions, next to Card content. It works in the ERD view, where cards list their fields, and stays greyed out in Compact mode.
- Ticking a checkbox or the **Show join fields** switch keeps your zoom and position. Picking another view or layout algorithm still fits the whole graph.
- A title-only preference saved earlier still shows only the titles.
- The settings scroll when the window is too short to fit them.

See [Models Canvas](../../docs/getting-started/setup-guide/models-canvas.md).

<!-- markdownlint-disable-file MD041 MD036 -->
