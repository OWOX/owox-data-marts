/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var ShopifyAdsFieldsSchema = {
  "abandoned-checkouts": {
    "overview": "Abandoned Checkouts",
    "description": "Lists checkout sessions that did not convert so you can recover them.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-01/queries/abandonedcheckouts",
    "fields": abandonedCheckoutsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_abandoned_checkouts",
    "queryName": "abandonedCheckouts",
    "connectionPath": "abandonedCheckouts"
  },
  "articles": {
    "overview": "Articles",
    "description": "Articles from the blogging system.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-01/objects/Article",
    "fields": articlesFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_articles",
    "queryName": "articles",
    "connectionPath": "articles"
  },
  "blogs": {
    "overview": "Blogs",
    "description": "Blogs in the store.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-01/objects/Blog",
    "fields": blogsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_blogs",
    "queryName": "blogs",
    "connectionPath": "blogs"
  },
  "collections": {
    "overview": "Collections",
    "description": "Product collections in the store.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-01/objects/Collection",
    "fields": collectionsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_collections",
    "queryName": "collections",
    "connectionPath": "collections"
  },
  "customers": {
    "overview": "Customers",
    "description": "Customer accounts in the store.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-01/objects/Customer",
    "fields": customersFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_customers",
    "queryName": "customers",
    "connectionPath": "customers"
  },
  "draft-orders": {
    "overview": "Draft Orders",
    "description": "Draft orders that can be converted to orders.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-01/objects/DraftOrder",
    "fields": draftOrdersFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_draft_orders",
    "queryName": "draftOrders",
    "connectionPath": "draftOrders"
  },
  "discount-codes": {
    "overview": "Discount Codes",
    "description": "Discount codes and their usage.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-01/objects/DiscountCodeNode",
    "fields": discountCodesFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_discount_codes",
    "queryName": "codeDiscountNodes",
    "connectionPath": "codeDiscountNodes"
  },
  "fulfillment-orders": {
    "overview": "Fulfillment Orders",
    "description": "Fulfillment orders representing items to be fulfilled from a location.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-01/objects/FulfillmentOrder",
    "fields": fulfillmentOrdersFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_fulfillment_orders",
    "queryName": "fulfillmentOrders",
    "connectionPath": "fulfillmentOrders"
  },
  "fulfillments": {
    "overview": "Fulfillments",
    "description": "Fulfillments representing shipped items.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-01/objects/Fulfillment",
    "fields": fulfillmentsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_fulfillments",
    "queryName": "fulfillments",
    "connectionPath": "fulfillments"
  },
  "inventory-items": {
    "overview": "Inventory Items",
    "description": "Inventory items representing SKUs.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-01/objects/InventoryItem",
    "fields": inventoryItemsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_inventory_items",
    "queryName": "inventoryItems",
    "connectionPath": "inventoryItems"
  },
  "inventory-levels": {
    "overview": "Inventory Levels",
    "description": "Inventory quantities at locations.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-01/objects/InventoryLevel",
    "fields": inventoryLevelsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_inventory_levels",
    "queryName": "inventoryLevels",
    "connectionPath": "inventoryLevels"
  },
  "locations": {
    "overview": "Locations",
    "description": "Physical or virtual locations for inventory and fulfillment.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-01/objects/Location",
    "fields": locationsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_locations",
    "queryName": "locations",
    "connectionPath": "locations"
  },
  "orders": {
    "overview": "Orders",
    "description": "Orders placed in the store.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-01/objects/Order",
    "fields": ordersFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_orders",
    "queryName": "orders",
    "connectionPath": "orders"
  },
  "order-risks": {
    "overview": "Order Risk Assessments",
    "description": "Risk assessments for orders.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-01/objects/OrderRiskAssessment",
    "fields": orderRisksFields,
    "uniqueKeys": ["orderId"],
    "destinationName": "shopify_order_risks",
    "queryName": "orders",
    "connectionPath": "orders",
    "nestedField": "risks"
  },
  "products": {
    "overview": "Products",
    "description": "Products in the store catalog.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-01/objects/Product",
    "fields": productsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_products",
    "queryName": "products",
    "connectionPath": "products"
  },
  "product-variants": {
    "overview": "Product Variants",
    "description": "Variants of products.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-01/objects/ProductVariant",
    "fields": productVariantsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_product_variants",
    "queryName": "productVariants",
    "connectionPath": "productVariants"
  },
  "product-images": {
    "overview": "Product Images",
    "description": "Media images for products.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-01/objects/MediaImage",
    "fields": productImagesFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_product_images",
    "queryName": "products",
    "connectionPath": "products",
    "nestedField": "media",
    "nestedFilter": "mediaContentType: IMAGE"
  },
  "pages": {
    "overview": "Pages",
    "description": "Static pages in the store.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-01/objects/Page",
    "fields": pagesFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_pages",
    "queryName": "pages",
    "connectionPath": "pages"
  },
  "shop": {
    "overview": "Shop",
    "description": "Shop settings and information.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-01/objects/Shop",
    "fields": shopFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_shop",
    "queryName": "shop",
    "connectionPath": "shop",
    "isSingleton": true
  },
  "transactions": {
    "overview": "Transactions",
    "description": "Order transactions (payments, refunds, etc.).",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-01/objects/OrderTransaction",
    "fields": transactionsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_transactions",
    "queryName": "orders",
    "connectionPath": "orders",
    "nestedField": "transactions"
  },
  "refunds": {
    "overview": "Refunds",
    "description": "Refunds issued for orders.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-01/objects/Refund",
    "fields": orderRefundsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_refunds",
    "queryName": "orders",
    "connectionPath": "orders",
    "nestedField": "refunds"
  },
  "tender-transactions": {
    "overview": "Tender Transactions",
    "description": "Tender transactions for payments.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-01/objects/TenderTransaction",
    "fields": tenderTransactionsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_tender_transactions",
    "queryName": "tenderTransactions",
    "connectionPath": "tenderTransactions"
  },
  "metafield-articles": {
    "overview": "Article Metafields",
    "description": "Custom metafields for articles.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-01/objects/Metafield",
    "fields": metafieldsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_metafield_articles",
    "ownerType": "ARTICLE",
    "parentQuery": "articles"
  },
  "metafield-blogs": {
    "overview": "Blog Metafields",
    "description": "Custom metafields for blogs.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-01/objects/Metafield",
    "fields": metafieldsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_metafield_blogs",
    "ownerType": "BLOG",
    "parentQuery": "blogs"
  },
  "metafield-collections": {
    "overview": "Collection Metafields",
    "description": "Custom metafields for collections.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-01/objects/Metafield",
    "fields": metafieldsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_metafield_collections",
    "ownerType": "COLLECTION",
    "parentQuery": "collections"
  },
  "metafield-customers": {
    "overview": "Customer Metafields",
    "description": "Custom metafields for customers.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-01/objects/Metafield",
    "fields": metafieldsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_metafield_customers",
    "ownerType": "CUSTOMER",
    "parentQuery": "customers"
  },
  "metafield-draft-orders": {
    "overview": "Draft Order Metafields",
    "description": "Custom metafields for draft orders.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-01/objects/Metafield",
    "fields": metafieldsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_metafield_draft_orders",
    "ownerType": "DRAFTORDER",
    "parentQuery": "draftOrders"
  },
  "metafield-locations": {
    "overview": "Location Metafields",
    "description": "Custom metafields for locations.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-01/objects/Metafield",
    "fields": metafieldsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_metafield_locations",
    "ownerType": "LOCATION",
    "parentQuery": "locations"
  },
  "metafield-orders": {
    "overview": "Order Metafields",
    "description": "Custom metafields for orders.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-01/objects/Metafield",
    "fields": metafieldsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_metafield_orders",
    "ownerType": "ORDER",
    "parentQuery": "orders"
  },
  "metafield-pages": {
    "overview": "Page Metafields",
    "description": "Custom metafields for pages.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-01/objects/Metafield",
    "fields": metafieldsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_metafield_pages",
    "ownerType": "PAGE",
    "parentQuery": "pages"
  },
  "metafield-product-variants": {
    "overview": "Product Variant Metafields",
    "description": "Custom metafields for product variants.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-01/objects/Metafield",
    "fields": metafieldsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_metafield_product_variants",
    "ownerType": "PRODUCTVARIANT",
    "parentQuery": "productVariants"
  },
  "metafield-products": {
    "overview": "Product Metafields",
    "description": "Custom metafields for products.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-01/objects/Metafield",
    "fields": metafieldsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_metafield_products",
    "ownerType": "PRODUCT",
    "parentQuery": "products"
  },
  "metafield-shops": {
    "overview": "Shop Metafields",
    "description": "Custom metafields for the shop.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-01/objects/Metafield",
    "fields": metafieldsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_metafield_shops",
    "ownerType": "SHOP",
    "parentQuery": null
  }
};
