---
'owox': minor
---

**Shopify connector: line-item discount fields**

The orders `lineItems` JSON now includes `discountedUnitPriceAfterAllDiscountsSet` (unit price after all discounts, including order-level), `totalDiscountSet` (total line-targeted discount, excludes order-level discounts), and `discountAllocations` with `allocatedAmountSet` per discount application.

<!-- markdownlint-disable-file MD041 MD036 -->
