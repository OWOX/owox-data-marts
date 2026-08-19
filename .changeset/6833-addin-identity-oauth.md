---
'owox': minor
---

Add the Microsoft-first identity flow for Office add-ins. A verified Entra access token can now
be exchanged directly for project tokens when the add-in supplies a project, or for a
project-neutral identity session used to list and explicitly select projects. The new flow is
feature-gated and keeps the existing Google Sheets and MCP authentication contracts unchanged.
