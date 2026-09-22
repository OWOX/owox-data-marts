# Models Canvas

The **Models** canvas shows the Data Marts of one storage as an entity-relationship diagram: every Data Mart is a card, every relationship between two Data Marts is an arrow. Use it to see how your model hangs together, to spot Data Marts that are not connected to anything, and to read the fields of each Data Mart without opening it.

## Where to find it

Open **Data Marts → Models** and pick a storage. The canvas remembers the last storage you looked at, and the layout you arrange by dragging cards is kept per storage in your browser.

Click a card to highlight every relationship it takes part in; click it again, or the empty canvas, to clear the highlight. The arrow icon on a card opens that Data Mart in a new tab.

## Toolbar

- **Search** highlights the Data Marts whose title matches and zooms to them. It does not remove the other cards.
- **Relationships filter** narrows the canvas to **All Data Marts**, **With relationships only** (Data Marts joined to at least one other visible Data Mart) or **Without relationships only** (Data Marts no visible Data Mart joins to — candidates to connect, or to clean up). Connectivity is judged on the Data Marts the status filter leaves visible: a Data Mart whose only relationship leads to a hidden draft counts as unconnected in a _Published only_ view.
- **Status filter** shows all Data Marts, published ones only, or drafts only.
- **Actions** run bulk operations — publish, delete, [Data Quality](data-quality-checks.md) and [Data Last Updated](data-last-updated.md) checks — on the Data Marts the canvas currently shows, and hold the [Export](models-canvas-export.md) submenu.

The filters and the search are part of the page URL (`rel`, `status`, `search`), so a filtered canvas can be shared as a link.

## Canvas settings

The gear button on the canvas opens the view settings. They are browser preferences, shared with the Joinable Data Marts diagram, and do not change the model itself.

- **View** — **Compact** cards show the title, the source badge, the status and the field count; **Detailed** cards add the field rows of the Data Mart's Output Schema, primary keys first, with a **+N more fields** toggle for long schemas.
- **Layout algorithm** — lay the graph out horizontally or vertically. Picking an algorithm re-runs the layout and drops the positions you dragged cards to.
- **Show join fields** — label every arrow with the join conditions (`source_field = target_field`).
- **Object labels** — tick what every card shows:
  - **Input source** — the badge naming the definition type (VIEW / TABLE / SQL / PATTERN / CONNECTOR).
  - **Field count** — the number of fields in the Output Schema.
  - **Status** — the published/draft indicator.
  - **Field aliases** — in the Detailed view, the Output Schema alias under each field name, when it is set and differs from the name.
  - **Field descriptions** — in the Detailed view, the Output Schema description under each field, when it is set. Long descriptions are cut to one line; hover the line to read the whole text.

  **Check all** turns everything back on; **Uncheck all** leaves only the titles (and, in the Detailed view, the field names and types).

## Notes

- Field rows, aliases and descriptions appear once the canvas has loaded the Data Mart details; on a very large model, the cards fill in a few seconds after the diagram appears.
- The [Joinable Data Marts](joinable-data-marts.md) page shows the same kind of diagram for the relationships of a single Data Mart, with the same view settings.
