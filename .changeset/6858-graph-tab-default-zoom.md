---
'owox': minor
---

# Open the Joinable Data Marts diagram fitted to the whole graph

Switching to the Graph view could land on a viewport zoomed in on the root card, as if the fit had never run, until "Fit to view" was pressed. The automatic first fit relied on fitView, which only accounts for nodes whose DOM dimensions are already measured — on first mount it ran against a half-measured subset. The initial viewport is now derived from the layout geometry itself, so the Graph view always opens showing the entire diagram, exactly as the "Fit to view" button leaves it.
