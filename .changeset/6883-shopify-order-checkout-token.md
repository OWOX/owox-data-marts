---
'owox': minor
---

# Checkout token for Shopify orders

The Shopify connector now offers a `checkoutToken` field on the `orders` node. Add `orders checkoutToken` to the Fields list to import it. The value matches `checkout.token` in Shopify Web Pixel events, so you can join orders with `checkout_completed` events. Orders that did not originate from a checkout, such as orders created through the API, have no token and return NULL.
