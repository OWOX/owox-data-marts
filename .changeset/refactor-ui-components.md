---
'owox': minor
---

# Enhance table UX with accessible checkboxes and improved forms

Refactors table selection checkboxes into a reusable component for consistent styling and accessibility. Improves form usability by adding proper label associations and restructuring help text. Enhances dark mode support across health status indicators and UI primitives.

- Extract `TableSelectionCheckbox` component to eliminate duplicated checkbox markup in tables
- Replace inline checkbox buttons in DataMartTable, ToggleColumnsHeader, TableActionsButton, and StorageResourceTree
- Add `presentationOnly` mode for visual checkboxes inside interactive elements
- Enable sorting by Contexts column in DataMart, DataStorage, and DataDestination tables
- Add `id`/`htmlFor` label associations to Switch components in DataMartOverviewContent
- Wrap help accordions in `FormDescription` for semantic consistency across MemberDetailsSheet, InviteMemberSheet, AddContextSheet, and ContextDetailsSheet
- Add missing dark mode styles to health status ring indicators
- Fix checkbox background color consistency in light theme
- Improve ContextBadges truncation behavior with flexible max-width
- Redesign empty state in ContextsCheckboxList with centered action button
- Reduce vertical spacing in DataMartSchemaSettings action bar
- Split long help text into multiple paragraphs for readability
