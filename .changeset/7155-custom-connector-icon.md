---
'owox': minor
---

**Tell custom connectors apart: set their icon in the Connector Builder**

A custom connector without an icon looks like every other such connector in the connector list, in the connector picker and on a Data Mart. Before, you could set an icon only through the API or an AI assistant, because the Connector Builder had no field for it. Now **General** has an **Icon** field: upload an SVG, PNG, JPEG or WebP file and click **Save draft**.

![The General section of the Connector Builder for an npm downloads connector, with a blue package icon in the Icon field and the Replace and Remove buttons beside it](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/432166b0-ccb3-4de8-4b1a-70ea985c9f00/w=800)

- The builder scales a PNG, JPEG or WebP image down to 128 × 128 px. An SVG file must be smaller than 48 KB.
- The icon is not part of a connector version. It changes when you save and does not wait for **Publish**.
- The **Input Source** card of a Data Mart now shows the icon of its custom connector.

See [Connector Builder](../../docs/connectors/connector-builder.md#step-1-describe-the-connector).

<!-- markdownlint-disable-file MD041 MD036 -->
