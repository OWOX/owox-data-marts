---
'owox': minor
---

**Shopify connector: more orders fields, including line-item discounts**

The orders `lineItems` JSON now includes `discountedUnitPriceAfterAllDiscountsSet` (unit price after all discounts, including order-level), `totalDiscountSet` (total line-targeted discount, excludes order-level discounts), and `discountAllocations` with `allocatedAmountSet` per discount application.

The orders field list also gains 47 previously unavailable scalar and money fields (order number, confirmation number, test/edited flags, additional payment and duties totals, fulfillment and tax flags, and more). These are opt-in via the existing **Fields** picker and aren't added to any data mart automatically.

<!-- markdownlint-disable-file MD041 MD036 -->
