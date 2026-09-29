---
'owox': minor
---

**Custom no-code connectors**

Build a connector to any REST API without writing code. A declarative manifest describes the
API — authentication, pagination, nodes and fields — and a three-pane web builder edits it with
live testing against the real endpoint. Connectors are versioned: publish, roll back, and bind
them to Data Marts alongside the built-in ones. Title, description and documentation link stay
editable; the name is fixed once the connector exists, because a Data Mart references its
connector by name — deleting a connector frees its name to be used again. A connector's
manifest is readable by editors only — it is author-written JSON that can hold a credential
typed straight into the builder — while the connector list, its configuration form and its
field schema stay open to viewers. Publishing a version, or making another version active,
changes what runs in every Data Mart that follows the connector's active version, so it needs
edit access to each of those Data Marts; otherwise a project admin can do it.

<!-- markdownlint-disable-file MD041 MD036 -->
