---
'owox': minor
---

**Shopify connector: more orders fields, including line-item discounts**

The orders `lineItems` JSON now includes `discountedUnitPriceAfterAllDiscountsSet` (unit price after all discounts), `totalDiscountSet` (the line's discount total, excluding order-level discounts), `currentQuantity` (units net of refunds and removals), and `discountAllocations` with the allocated amount and the discount's type, code or title, and `index`. The index joins each allocation to its entry in `discountApplications`, which now also exports `index` and `__typename`. See the [Discount Fields section in the connector guide](https://docs.owox.com/packages/connectors/src/sources/shopify/getting-started/) for how the amounts differ.

Data marts that already select `lineItems` or `discountApplications` get the new JSON keys on their next run; previously imported rows keep the old shape until a backfill.

The orders field list also gains 47 previously unavailable scalar and money fields (order number, confirmation number, test/edited flags, additional payment and duties totals, fulfillment and tax flags, and more). These are opt-in via the existing **Fields** picker and aren't added to any data mart automatically.

See the [Shopify connector guide](https://docs.owox.com/packages/connectors/src/sources/shopify/getting-started/) for setup.

<!-- markdownlint-disable-file MD041 MD036 -->
