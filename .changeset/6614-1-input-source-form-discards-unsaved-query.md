---
'owox': minor
---

# Keep an unsaved SQL query when the Data Mart refreshes underneath the editor

The Input Source form re-read the saved definition whenever the Data Mart object was rebuilt in the page context — schema actualization after a save, a publish, a relationship change — and not only when the user picked another definition type. The SQL editor kept its own copy of the text and synced one way from the form, so that reset pushed the saved query back into Monaco and discarded everything typed since the last save.

Changing an existing Data Mart's input source to SQL runs schema actualization right after the save; it finishes seconds later, while the user is usually still editing the query, so the keystrokes made in the meantime disappeared.

In the staged type-change state the same reset resolves to an empty definition instead, which left the editor showing a query the form no longer held: Save silently disabled with a valid query on screen.

The form now resets only when the definition type actually changes, and never over unsaved edits. The SQL editor is fully controlled, so the form value and the editor content cannot drift apart.
