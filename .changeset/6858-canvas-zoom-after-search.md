---
'owox': minor
---

Fix the Joinable Data Marts diagram zoom controls dying after opening a data mart page

The +/- zoom buttons on the Joinable Data Marts diagram could stop responding until "Fit to view" was pressed, depending on how the page was opened. The allowed zoom range was captured once from a completed fit, so a fit that ran under transient conditions (a still-loading graph or a settling pane) froze the range in an unusable state. The range is now derived from the live graph and pane geometry, small graphs that fit at the maximum zoom keep a usable zoom-out floor, and a corrupted viewport recovers with a full fit instead of ignoring clicks.
