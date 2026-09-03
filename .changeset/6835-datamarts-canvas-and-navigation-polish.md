---
'owox': minor
---

# Model Canvas and Data Mart navigation polish

The Model Canvas page (formerly "Models") now opens straight into your data model: with a single storage, it's selected automatically instead of asking you to pick one first. When you do need to switch, the storage picker moved up into the page header as a clear "Model for [Storage]" title, and a "Data Marts" breadcrumb takes you back to the list in one click — the same breadcrumb now appears on the Reports, Triggers, Run History, and Insights pages too.

On the canvas itself, each Data Mart card now shows a full-height color stripe reflecting its Data Quality status, so you can spot cards with warnings or errors at a glance instead of opening each one. Downloading the canvas (as an image, JSON, or OKF Markdown) is now a dedicated button in the toolbar instead of being tucked inside the Actions menu, and bulk actions like Publish and Delete now state exactly how many Data Marts they'll affect.

Opening the canvas with no filters applied now shows all Data Marts, published or draft, connected or not — previously it defaulted to published-only, connected-only.

Long Data Mart names in tables no longer wrap and push rows taller — they truncate with the full name available on hover.

In the Reports table, the Report column now leads, with Data Mart moved to second place.
