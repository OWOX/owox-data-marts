---
'owox': minor
---

# Checkout and cart tokens for Shopify orders

The Shopify connector now offers `checkoutToken` and `cartToken` fields on the `orders` node. Select them under `orders` in the connector's field picker to import them. `checkoutToken` matches `checkout.token` in Shopify Web Pixel events, so you can join orders with `checkout_completed` events; `cartToken` identifies the cart that produced the order. Orders with no associated checkout or cart return NULL. Orders imported before you enable the fields stay NULL until you re-import them with a backfill run.
