---
'owox': minor
---

# Clearer permission errors when managing Storages, Destinations, and Data Marts

Previously, actions like managing owners or configuring sharing failed with a vague message that did not explain who could perform them, and the error toast disappeared after a few seconds. Now each message names the exact role required — such as owner with the Technical User role, or Project Admin — and the "access forbidden" toast stays on screen until you dismiss it. This helps users understand why an action was blocked and what role they need to proceed.
