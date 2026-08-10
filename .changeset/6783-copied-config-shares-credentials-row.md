---
'owox': minor
---

# Fix: "Copy from..." no longer shares or deletes another Data Mart's credentials

Using "Copy from..." to reuse a connector configuration from another Data Mart
made both Data Marts point at the same stored credentials instead of copying
the values. Saving the new Data Mart could then delete those shared
credentials, wiping them on both.

Copying a configuration that holds manually entered credentials now always
creates its own credentials record, and a Data Mart can no longer write to or
delete credentials that belong to another one. Data Marts that already share a
record are separated automatically the next time each of them is saved.

Three details worth knowing:

- Connections authorized through OAuth are still shared between Data Marts, as
  they were before — such a credential belongs to the project rather than to a
  single Data Mart.
- Credentials already wiped by this bug are not restored; those Data Marts need
  their credentials entered again.
- A copied Microsoft Ads configuration starts from the source's current
  (rotated) refresh token, so the copy keeps working even when the originally
  entered token has already expired. From there each Data Mart rotates its own
  token independently.
