---
'owox': minor
---

**Shopify connector: more orders fields, including line-item discounts**

The orders `lineItems` JSON now includes `discountedUnitPriceAfterAllDiscountsSet` (unit price after all discounts, including order-level), `totalDiscountSet` (total line-targeted discount, excludes order-level discounts), and `discountAllocations` with `allocatedAmountSet` and the `discountApplication.index` per allocation. The index joins each allocation to its entry in `discountApplications`, which now also exports `index`. Both discounted amounts include discounts allocated to refunded and removed quantities.

Data marts that already select `lineItems` or `discountApplications` get the new JSON keys on their next run; previously imported rows keep the old shape until a backfill.

The orders field list also gains 47 previously unavailable scalar and money fields (order number, confirmation number, test/edited flags, additional payment and duties totals, fulfillment and tax flags, and more). These are opt-in via the existing **Fields** picker and aren't added to any data mart automatically.

See the [Shopify connector guide](https://docs.owox.com/packages/connectors/src/sources/shopify/getting-started/) for setup.

<!-- markdownlint-disable-file MD041 MD036 -->
