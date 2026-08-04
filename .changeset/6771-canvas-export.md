---
'owox': minor
---

# Export the Models canvas as SVG, PNG, JSON, or an OKF bundle

The Models canvas now exports the data model through **Actions → Export**. Four formats are available:

- **Image (SVG)** — a vector snapshot of the whole visible model, crisp at any zoom.
- **Image (PNG)** — the same snapshot rasterized at 2× scale, for chats and tools that do not render SVG.
- **JSON** — the model graph (Data Marts, schemas, joins, canvas positions) in the OWOX Model Canvas format, sanitized of project identifiers.
- **OKF (Markdown)** — a zip with one cross-linked Markdown document per Data Mart plus an index: an overview, the schema table, and the join list per mart. Reads as a small wiki and works well as context for AI assistants.

The export covers exactly what the canvas shows — the same filtered set the other Actions target — and captures the whole model regardless of the current pan and zoom. Image backgrounds follow the active theme, so dark-theme exports stay readable outside the app.

The canvas itself also got leaner along the way:

- The **Actions** menu moved from an overlay in the canvas corner into the toolbar above the canvas — consistent with the Data Marts list, and it no longer covers canvas content.
- The field count now sits on the same row as the Data Quality and Data Last Updated indicators instead of taking a line of its own, so every card is one row shorter and the model is easier to scan.
- The Object labels settings list dropped its decorative glyphs.
