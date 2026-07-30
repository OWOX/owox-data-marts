---
'owox': minor
---

# Models canvas redesigned as an ERD

The Data Marts **Models** canvas now renders proper ERD cards instead of plain title boxes. Each card shows a definition-type badge and accent color (`SQL` / `View` / `Table` / `Pattern` / `Connector`), a published/draft status dot, and — in the new **Detailed** view — typed field rows with a primary-key indicator, primary keys first, and hidden-for-reporting fields dimmed. Long field lists collapse to 4 rows with an in-place "+N more fields" toggle. Switch between **Compact** (default) and **Detailed** in the canvas settings; the choice is remembered per browser.

Cards are now draggable, edges are smooth brand-blue bezier curves, and join labels gain a cardinality badge (`1:1` / `N:1` / `1:N`) derived from the marts' primary keys — shown only when the join provably covers a key. The minimap colors nodes by definition type. The canvas renders immediately from the list data and enriches cards with fields as details load, so large models appear without delay.

Thanks to @ikrasovytskyi for contributing the redesign!
