---
'owox': minor
---

<!-- markdownlint-disable-file MD041 MD036 -->

**Clearer Data Mart cards on the Models canvas**

Cards on **Data Marts → Models** now match the Data Mart cards on the OWOX website. Each card leads with an icon and the title. Short badges below show the input source, the field count, the number of triggers and the number of relationships. The footer keeps the Data Quality and Data Last Updated indicators. It also shows when the Data Mart is shared for reporting or for maintenance.

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/d8b42ed206123bc93f69df099857722d/iframe>

- Only unpublished Data Marts carry a status badge, **Draft**, next to the title. Published ones no longer show a Published label.
- The relationships count covers the whole storage, whatever the canvas filters hide.
- A count of zero shows no badge, so a Data Mart without triggers or relationships keeps a shorter card.
- **Object labels** in the canvas settings still hide the badges. **Uncheck all** still leaves only the titles.

See [Models Canvas](../../docs/getting-started/setup-guide/models-canvas.md).
