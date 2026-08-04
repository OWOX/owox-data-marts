---
'owox': minor
---

# Change the Input Source of an existing Data Mart

The Input Source type of a Data Mart can now be changed after it has been set up — a table can become a SQL query, a view can be repointed at a real table, and so on, within the same storage. Previously the type was frozen once saved, so the only way to switch was to rebuild the Data Mart from scratch and recreate everything attached to it.

The Data Mart keeps its identity through the change: relationships in both directions, reports and their column configuration, and field-level metadata such as aliases, descriptions and aggregation roles all stay in place. Fields that are missing from the new source are marked as disconnected and fields whose type changed are flagged, the same way they already are when a source of the same type is edited.

Because a change can disconnect fields that reports and relationships rely on, it is confirmed in a dialog that states what is preserved, what may break, and how many relationships and reports depend on this Data Mart. A published Data Mart stays published. The new source is checked against the storage before the change is saved, so an unreachable table or an invalid query is refused instead of replacing a working definition and failing later.

The schema is refreshed automatically right after the change, and refreshing the output schema now reports what it found — how many fields are connected, and how many came back disconnected or with a type mismatch — instead of only confirming that it ran.

Data Marts based on a connector are not affected: their Input Source type stays fixed, and no other type can be switched to a connector.
