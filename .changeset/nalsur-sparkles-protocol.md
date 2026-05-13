---
'owox': minor
---

# AI helper for Data Mart metadata

Filling in titles, descriptions, field aliases and field descriptions by hand
is now optional. A Sparkles ✨ button appears next to each of those inputs and
asks the AI to draft a value based on the data mart's schema and a 30-row
sample of the actual data. You review the suggestion in the input and click
Apply (or just edit it further) before anything is saved — nothing is changed
behind your back.

- **One-click title and description.** While editing the data mart title or
  description, click the Sparkles button on the right of the field to get an
  AI draft grounded in the real columns and sample values. Save or keep
  editing — your call.
- **Per-field alias and description.** Open the editor on any column's Alias
  or Description in the Output Schema and the Sparkles button writes a
  suggestion straight into the open textarea. Cancel discards it, Apply
  commits it to the local schema so you can still review the whole change
  before saving the schema.
- **Bulk fill for the whole schema.** A new icon button next to *Refresh
  schema* opens a menu with **Generate field descriptions** and **Generate
  field aliases** — useful when you want to populate every column at once.
  Generated values land in the editable schema, so you can tweak any row
  before clicking Save.
- **Grounded in your real data.** Each AI call runs the data mart, grabs up
  to 30 sample rows, and feeds them to the model along with the schema so
  aliases match the values you actually have (e.g. `cnt` → `Count`,
  `event_ts` → `Event Timestamp, in UTC`).
- **Not for connector-based data marts (yet).** AI suggestions are available
  for SQL, Table, View and Table Pattern definitions. Connector data marts
  still need their metadata filled by hand.
- **Self-hosted? Bring your own AI key.** The Sparkles buttons appear only
  when `AI_BASE_URL`, `AI_API_KEY` and `AI_MODEL` are configured on the
  deployment. Add them to your environment and the buttons light up — no
  re-deploy of the UI required.
