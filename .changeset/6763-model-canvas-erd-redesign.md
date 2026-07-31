---
'owox': minor
---

# Models canvas redesigned as an ERD, Joinable Data Marts diagram to match

The Data Marts **Models** canvas now renders proper ERD cards instead of plain title boxes. Each card shows a definition-type badge and accent color (`SQL` / `View` / `Table` / `Pattern` / `Connector`), a published/draft status dot, and — in the new **Detailed** view — typed field rows with a primary-key indicator, primary keys first, and hidden-for-reporting fields dimmed. Long field lists collapse to 4 rows with an in-place "+N more fields" toggle. Switch between **Compact** (default) and **Detailed** in the canvas settings; the choice is remembered per browser.

Cards are draggable, and the canvas remembers how you arranged them: positions persist per storage in your browser and survive a reload (picking a layout algorithm re-flows from scratch). A new **Object labels** setting toggles what every card shows — input-source badge, field count, status dot — with "Check all" / "Uncheck all" shortcuts. Relationship lines are smooth bezier curves, neutral gray at rest and brand-blue when selected — click a single line, or click a data mart card to light up every one of its connections at once. The minimap colors nodes by definition type. The canvas renders immediately from the list data and enriches cards with fields as details load, so large models appear without delay.

The **Joinable Data Marts** diagram on the Data Mart page now uses the same ERD card design, and its gear popover gains two filters: **Show looped Data Marts** (off by default — self-referencing loop stubs no longer blow up the graph) and a **Status** filter (All / Published / Draft).

Thanks to @ikrasovytskyi for contributing the redesign!
