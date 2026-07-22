---
'owox': minor
---

# Fix dropped characters and lost focus in connector settings

Previously, typing into a field on the "Configure Settings" step dropped
characters, so text seemed to appear only on the second try. Pasted values
could revert as well. Credential fields also lost focus after the first
character, forcing users to click back into the field.

Both problems are fixed. Fields now keep focus and accept every character,
whether typed quickly or pasted.
