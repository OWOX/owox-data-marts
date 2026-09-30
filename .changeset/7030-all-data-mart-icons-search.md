---
'owox': minor
---

**Pick any Lucide icon for a Data Mart, with search**

The Data Mart icon picker now offers the whole [Lucide](https://lucide.dev/icons/) icon library, more than 1,500 icons, not only the recommended set. The recommended icons stay at the top. **All icons** lists the rest below them. See [Data Mart icons](../../docs/getting-started/setup-guide/models-canvas.md#data-mart-icons).

The video shows the picker, a search and the picked icon on the Models canvas:

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/b2c4e98b7070ff732ac563da2231604a/iframe>

- A search box filters both lists by English name, for example `cart` or `arrow up`. A recommended icon also matches the name of its picture, so `cart` finds **Purchases**. Enter picks the first match.
- The picked icon shows on the Data Mart page, on the Models canvas card and in the PNG and SVG exports, like the recommended ones.
- In the API, `icon` on `POST /api/data-marts` and `PUT /api/data-marts/{id}/icon` also accepts `lucide:<icon-name>`, for example `lucide:rocket`. Detail, list and Models canvas responses return the same value. The recommended keys such as `purchases` are unchanged, so icons picked before keep working.

<!-- markdownlint-disable-file MD041 MD036 -->
