# Export the Models Canvas

The **Models** canvas shows your Data Marts as an entity-relationship diagram: every Data Mart is a card, every join is an arrow. The canvas can be exported — as an image for a presentation or documentation, or as a machine-readable model you can archive, diff, or open in other tools.

## Where to find it

Open **Data Marts → Models**, pick a storage, and open the **Actions** menu in the toolbar above the canvas. The **Export** submenu lists the available formats.

The export always covers **what the canvas currently shows**: the same filtered set of Data Marts the other Actions target. Narrow the canvas with the storage, status, or relationship filters first if you want to export a subset. The search box only highlights matching Data Marts — it does not narrow the export, just as it does not narrow the other Actions. When the canvas is empty, there is nothing to export and the menu is not shown.

## Formats

| Format | File | Best for |
| --- | --- | --- |
| **Image (SVG)** | `<storage>-<date>.svg` | Documentation and presentations — vector, crisp at any zoom |
| **Image (PNG)** | `<storage>-<date>.png` | Chats and tools that do not render SVG — raster at 2× scale |
| **JSON** | `<storage>-<date>.json` | Programmatic use — the model graph in the Model Canvas format |
| **OKF (Markdown)** | `<storage>-<date>.zip` | Human- and LLM-readable model documentation |

Both images capture the **whole visible model**, not just the part of it inside the viewport — the current pan and zoom do not affect the output. The image background matches your current theme, so dark-theme exports stay readable outside the app.

### JSON

The JSON file contains the model graph — Data Marts with their schemas and canvas positions, and the joins between them — in the format used by [OWOX Model Canvas](https://model.owox.com/). The file is sanitized: it carries no project identifiers, so it is safe to share.

### OKF bundle

OKF (Open Knowledge Format) is a Markdown-based description of a data model: the zip contains one `.md` document per Data Mart — with an overview, the schema table, and the join list — plus an `index.md` catalog. Each join links to the document of the Data Mart it points at, so the bundle reads as a small cross-linked wiki. The same format is produced and imported by [OWOX Model Canvas](https://model.owox.com/), and it works well as context for AI assistants.

## Notes

- Schemas appear in JSON and OKF exports once the canvas has loaded Data Mart details; on a very large model, wait for the cards to show their fields before exporting.
- Field aliases are included alongside technical field names where they differ.
