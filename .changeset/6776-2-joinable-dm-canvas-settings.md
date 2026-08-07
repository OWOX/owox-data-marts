---
'owox': minor
---

# Joinable Data Marts diagram: the same view settings as the Models canvas

The gear on the Joinable Data Marts diagram is back — and it now holds the same view settings as the Models canvas, shared component and all:

- **View** — switch cards between **Compact** and **Detailed**; Detailed shows the joined mart's field rows (name + type, hidden-for-reporting fields dimmed), collapsed to 4 rows with an in-place "+N more" toggle.
- **Layout algorithm** — **Horizontal** or **Vertical**; the diagram now uses the same dagre layout engine as the Models canvas.
- **Show join fields** — join conditions (`source = target`) rendered as labels on the relationship lines.
- **Object labels** — toggle the input-source badge and accent stripe, the field count, and the status dot per card, with "Check all" / "Uncheck all" shortcuts.

All settings are remembered per browser, and the inline and fullscreen diagrams stay in sync.
