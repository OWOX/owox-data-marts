---
'owox': minor
---

**Pick an icon for each Data Mart**

Click the icon next to a Data Mart's title to give it one that matches its subject: purchases, orders, sessions, customers, countries, ad spend, traffic sources and more. The icon shows on the Data Mart page, on its card on **Data Marts → Models** and in the canvas PNG and SVG exports. **Reset to default** brings back the plain box that Data Marts show until an icon is picked.

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/d35ceae3211057665fd00b51d5904bce/iframe>

- Changing the icon needs edit access to the Data Mart.
- The API returns the icon as `icon` on a Data Mart, in the Data Mart list and in `GET /api/model-canvas/data-marts`. Set it with `PUT /api/data-marts/{id}/icon` or when creating a Data Mart; an unknown icon key is rejected with `400`, and `null` resets it.

See [Models Canvas](../../docs/getting-started/setup-guide/models-canvas.md#data-mart-icons).

<!-- markdownlint-disable-file MD041 MD036 -->
