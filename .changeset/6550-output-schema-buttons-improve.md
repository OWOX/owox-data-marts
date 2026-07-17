---
'owox': minor
---

# Improve Output Schema AI actions

This PR improves the discoverability and organization of Output Schema actions. The **Refresh schema** and global **Generate field aliases & descriptions** actions are now located in the table toolbar, keeping all primary actions in one place. The global AI action has also been simplified by removing the dropdown menu, allowing users to generate both field aliases and descriptions with a single click.

To make AI features easier to discover, AI action buttons have been added to the **Alias** and **Description** column headers, allowing users to generate values for an entire column directly where the action applies.

To support these changes, all business logic remains in `DataMartSchemaSettings`, while `TableToolbar` stays a presentational component. A new `SchemaToolbar` interface is used to pass toolbar state and callbacks through the component hierarchy.
