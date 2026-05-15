---
'owox': minor
---

# Membership requests on the new Members page

Project Admins can now see and act on pending requests to join a project from the new Project Settings → Members page. The section is admin-only, hidden when empty, and renders as a collapsible card of inline request rows above the members list. Clicking a row opens a side sheet where the admin picks the final role, role scope and (optionally) the contexts to pre-assign before approving, or declines the request with a confirmation dialog.

The full path ships in this release: IDP protocol contract, backend use-cases, web UI, and a real C2C call to the Integrated backend's `/membership-requests` endpoints from the OWOX IDP provider.
