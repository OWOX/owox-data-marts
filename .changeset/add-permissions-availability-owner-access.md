---
'owox': minor
---

# Add availability model and activate owner-based access control

Introduced explicit availability settings for DataMarts (Available for reporting / Available for maintenance), Storages (Available for use / Available for maintenance), and Destinations (Available for use / Available for maintenance). Ownership now affects access: owners have direct access to their entities regardless of availability state, while non-owners see only available entities. Implemented table-driven AccessDecisionService that evaluates entity type, role, ownership status, availability state, and action for every single-entity operation. Enforced access checks on all endpoints including direct URL access, sub-operations (SQL dry run, validate definition, run history), and report creation. Existing entities default to fully available for backward compatibility; new entities default to not available (secure by default).
