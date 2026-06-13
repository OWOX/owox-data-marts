---
'owox': minor
---

# Add enterprise advanced search module for data marts

Introduce a pluggable enterprise (`src/ee`) module with an `advanced-search` submodule
that provides hybrid semantic + keyword search over data marts
(`GET /api/data-marts/search/advanced?q=...`). Embeddings are computed locally with a
multilingual ONNX MiniLM model (`Xenova/paraphrase-multilingual-MiniLM-L12-v2`, optional
`@huggingface/transformers` dependency) and stored as BLOBs in the existing SQLite/MySQL
database — no new database types. Data marts are indexed automatically via domain events
and a reconcile cron (worker instances only).

The EE module is loaded through a resilient loader: the community build stays
bit-identical when the `src/ee` directory is absent, `EE_MODULES_ENABLED=false`, or
`ADVANCED_SEARCH_ENABLED` is unset. All enterprise entrypoints (controller, cron, event
handlers) verify the Enterprise license at runtime via `AppEditionConfig` (`LICENSE_KEY`).
