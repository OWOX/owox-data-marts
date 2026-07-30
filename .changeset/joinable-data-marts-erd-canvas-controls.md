---
'owox': minor
---

# Joinable Data Marts diagram in the ERD design, plus new canvas controls

The **Joinable Data Marts** diagram on the Data Mart page now uses the same ERD card design as the Models canvas: accent stripe and definition-type badge (`SQL` / `View` / `Table` / `Pattern` / `Connector`), published/draft status dot, and a minimap colored by type. Two new filters live in the diagram's gear popover: **Show looped Data Marts** (off by default — self-referencing loop stubs no longer blow up the graph) and a **Status** filter (All / Published / Draft).

The **Models** canvas remembers how you arranged the cards: dragged positions persist per storage in your browser and survive a reload (picking a layout algorithm re-flows from scratch). A new **Object labels** setting lets you toggle what every card shows — input-source badge, field count, status dot — with "Check all" / "Uncheck all" shortcuts.

On both canvases, relationship lines are now neutral gray and turn brand-blue only when you click to select a specific edge. The edge cardinality badge introduced earlier was removed.
