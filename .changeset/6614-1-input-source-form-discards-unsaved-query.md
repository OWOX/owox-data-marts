---
'owox': minor
---

# Stop the Joinable Data Marts diagram from eating spaces typed into the SQL editor

With the Joinable Data Marts section in diagram view, pressing Space in the SQL Query editor inserted nothing. React Flow's default Space pan shortcut listens on the whole document and calls `preventDefault()` on its match; its is-this-an-input check recognizes only `input`/`select`/`textarea`/`contenteditable`, while Monaco's new EditContext input is a plain `div` — so the canvas killed every space before it reached the editor. This is why the symptom appeared only on Data Marts that have relationships (the diagram never mounts otherwise) and looked tied to switching the input source to SQL.

Two changes close it: the embedded relationship canvas no longer registers any global key shortcut (`panActivationKeyCode` is disabled, like `deleteKeyCode` already was), and the SQL editor container carries React Flow's `nokey` marker so no canvas on the page can grab keystrokes typed into Monaco.

Also fixed on the same path: the Input Source form used to re-read the saved definition whenever the Data Mart object was rebuilt in the page context — schema actualization after a save, a publish, a relationship change — discarding everything typed since the last save; in the staged type-change state the same reset left Save silently disabled with a valid query on screen. The form now resets only when the definition type actually changes, and never over unsaved edits; the SQL editor is fully controlled, so the form value and the editor content cannot drift apart.
