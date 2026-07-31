---
'owox': minor
---

# Data Last Updated refreshes with every run

The **Data Last Updated** value now keeps itself current: every run that delivers data measures it on the way out. Report runs — manual and scheduled — record the measurement in Run History, and so do HTTP Data requests and MCP queries. When the run reads only the Data Mart's own sources, the measurement also becomes the Data Mart's saved value, so the list, the canvas, and the Data Mart page stay fresh without anyone pressing a button. A run that spans several joined Data Marts records the measurement in its history entry only, because a blended reading would overstate any single Data Mart.

On the canvas, the check moved into the **Actions** menu, next to Check Quality. It targets the same set of Data Marts as the other actions there — everything the current filters show.
