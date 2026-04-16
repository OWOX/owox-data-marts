---
'owox': minor
---

# Grey health indicator for unconfigured storages

Previously, a storage that had just been created but not yet configured showed a red health indicator — the same as a storage with broken credentials. Now, unconfigured storages show a distinct grey indicator with the message "Complete setup to activate Storage". Red is reserved for storages that have been configured but fail validation, and green for fully healthy ones.
