---
'owox': minor
---

# Editing a relationship description no longer collapses the joined Data Mart

On **Data Setup → Joinable Data Marts**, the **Description** tab of a joined Data Mart autosaves while you type. Previously every autosave reloaded the whole list of joined Data Marts: the expanded card collapsed, the Description tab closed and the cursor left the field, so a longer sentence could only be entered a few words at a time. Now the saved text is applied to the card in place — the card stays expanded, the tab stays open and the cursor stays where it was, while the description still reaches the AI assistant (MCP) and the report column picker as before. The "Relationship updated" notification no longer pops up after every pause: the description saves silently, like the other fields on the card, and only a failed save is reported.

Saving **Join Settings** is unchanged and still refreshes the list. See [Describe the Relationship](../../docs/getting-started/setup-guide/joinable-data-marts.md#step-3-describe-the-relationship-optional).
