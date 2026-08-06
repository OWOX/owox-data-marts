---
'owox': minor
---

# Joinable Data Marts: filters on the toolbar, applied to both List and Graph

The **Status** and **looped data marts** filters of the Joinable Data Marts block moved out of the diagram's gear popover onto the toolbar, right next to search — the same place the Models canvas keeps its filters. They are now dropdowns (`All statuses` / `Published only` / `Draft only`, and `Hide looped data marts` / `Show looped data marts`).

More importantly, the filters now cover **both views**: previously they only trimmed the Graph, so switching to List silently showed a different set of relationships. The List now applies the same rules as the diagram — including subtree semantics, where hiding a data mart also hides everything joined through it. Saved filter preferences carry over unchanged.
