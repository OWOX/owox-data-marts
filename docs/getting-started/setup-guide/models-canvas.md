# Models Canvas

The **Models** canvas draws the Data Marts of one storage as an entity-relationship diagram. Every Data Mart is a card, and every relationship between two Data Marts is an arrow. Use it to see how your model fits together and to spot Data Marts that nothing joins to. It also lets you read the fields of a Data Mart without opening it.

## Where to find it

Open **Data Marts → Models** and pick a storage. The canvas remembers the storage you looked at last. It also keeps the card positions you arranged by dragging, per storage, in your browser.

Click a card to highlight every relationship it takes part in. Click it again, or the empty canvas, to clear the highlight. The arrow icon on a card opens that Data Mart in a new tab.

## What a card shows

- The Data Mart **icon** and **title**, with a **Draft** badge when the Data Mart is not published yet. See [Data Mart icons](#data-mart-icons).
- The **input source** (Table, View, SQL, Pattern or Connector) and the **field count** of the Output Schema.
- The number of **triggers** and **relationships**. The relationships count covers the whole storage, whatever the filters hide. It counts the relationships the Data Mart defines and the ones that point to it.
- The [Data Quality](data-quality-checks.md) and [Data Last Updated](data-last-updated.md) indicators. The colored bar on the left edge repeats the Data Quality status.
- Sharing icons, when the Data Mart is shared for reporting or for maintenance. Hover an icon to see which one it is.

The trigger count and the sharing icons appear once the canvas has loaded the Data Mart details.

## Data Mart icons

Every card leads with an icon, so you can tell purchases from sessions at a glance. A Data Mart shows a plain box until someone picks an icon for it.

To pick one, open the Data Mart and click the icon next to its title. Choose from icons for common subjects: purchases, orders, products, sessions, customers, countries, ad spend, traffic sources and more. **Reset to default** brings back the box. You need edit access to the Data Mart to change its icon.

The icon shows on the Data Mart page, on the canvas card and in the PNG and SVG [exports](models-canvas-export.md).

## Toolbar

- **Search** highlights the Data Marts whose title matches and zooms to them. It does not remove the other cards.
- **Relationships filter** offers three views. **All Data Marts** shows everything. **With relationships only** keeps the Data Marts that join at least one other visible Data Mart. **Without relationships only** keeps the Data Marts that no visible Data Mart joins to. Those are candidates to connect, or to clean up. The filter counts only the relationships between Data Marts the status filter leaves visible. In a _Published only_ view, a Data Mart whose only relationship leads to a draft counts as unconnected.
- **Status filter** shows all Data Marts, published ones only, or drafts only.
- **Actions** runs bulk operations on the Data Marts the canvas currently shows. Those are publish, delete, [Data Quality](data-quality-checks.md) and [Data Last Updated](data-last-updated.md) checks. It also holds the [Export](models-canvas-export.md) submenu.

![The Models canvas relationships filter open with All Data Marts, With relationships only and Without relationships only, the last one selected and a single unconnected Data Mart left on the canvas](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/ff20092f-b242-4ad6-2ce5-c8e196db5100/w=800)

The page URL carries the filters and the search (`rel`, `status`, `search`). Share the link to share the filtered canvas.

## Canvas settings

The gear button on the canvas opens the view settings. They are preferences stored in your browser and do not change the model itself. The Joinable Data Marts diagram offers the same settings and stores its own values.

- **View** picks the card density. **Compact** cards show everything listed in [What a card shows](#what-a-card-shows). **Detailed** cards add the field rows of the Data Mart's Output Schema, primary keys first. Long schemas collapse behind a **+N more fields** toggle.
- **Layout algorithm** lays the graph out horizontally or vertically. Picking an algorithm re-runs the layout and drops the card positions you dragged.
- **Show join fields** labels every arrow with its join conditions (`source_field = target_field`).
- **Object labels** picks what every card shows:
  - **Input source** shows the badge with the definition type (VIEW / TABLE / SQL / PATTERN / CONNECTOR).
  - **Field count** shows the number of fields in the Output Schema.
  - **Status** shows the **Draft** badge on unpublished Data Marts.
  - **Field aliases** leads each field row in the Detailed view with the Output Schema alias, when the field has one. Untick it to see the technical field names instead. Hover a row to read both.
  - **Field descriptions** adds the Output Schema description under each field in the Detailed view, when the field has one. The line shows one row of text. Hover it to read the whole description.

  **Check all** turns every label back on. **Uncheck all** leaves only the titles. It also hides the counts, the indicators and the sharing icons. In the Detailed view it also leaves the technical field names and their types.

![The Models canvas in the Detailed view with the canvas settings open: Field aliases and Field descriptions are ticked under Object labels, and the Orders card lists each field by its alias with its description underneath](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/ce4e911b-1290-4ae2-9efd-29dc24fbae00/w=800)

## Notes

- Field rows, aliases and descriptions appear once the canvas has loaded the Data Mart details. On a very large model, the cards fill in a few seconds after the diagram appears.
- The [Joinable Data Marts](joinable-data-marts.md) page shows the same kind of diagram for the relationships of a single Data Mart.
