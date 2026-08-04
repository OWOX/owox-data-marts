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
