/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var ShopifyFieldsSchema = {
  "abandoned-checkouts": {
    "overview": "Abandoned Checkouts",
    "description": "Lists checkout sessions that did not convert so you can recover them.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-10/queries/abandonedcheckouts",
    "fields": abandonedCheckoutsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_abandoned_checkouts",
    "queryName": "abandonedCheckouts",
    "connectionPath": "abandonedCheckouts",
    "isTimeSeries": true,
    "queryFilterTemplate": "query: \"updated_at:>='{{startDate}}' AND updated_at:<='{{endDate}}'\""
  },
  "articles": {
    "overview": "Articles",
    "description": "Articles from the blogging system.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-10/objects/Article",
    "fields": articlesFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_articles",
    "queryName": "articles",
    "connectionPath": "articles",
    "isTimeSeries": false
  },
  "blogs": {
    "overview": "Blogs",
    "description": "Blogs in the store.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-10/objects/Blog",
    "fields": blogsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_blogs",
    "queryName": "blogs",
    "connectionPath": "blogs",
    "isTimeSeries": false
  },
  "collections": {
    "overview": "Collections",
    "description": "Product collections in the store.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-10/objects/Collection",
    "fields": collectionsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_collections",
    "queryName": "collections",
    "connectionPath": "collections",
    "isTimeSeries": false
  },
  "customers": {
    "overview": "Customers",
    "description": "Customer accounts in the store.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-10/objects/Customer",
    "fields": customersFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_customers",
    "queryName": "customers",
    "connectionPath": "customers",
    "isTimeSeries": true,
    "queryFilterTemplate": "query: \"updated_at:>='{{startDate}}' AND updated_at:<='{{endDate}}'\""
  },
  "discount-codes": {
    "overview": "Discount Codes",
    "description": "Discount codes and their usage.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-10/objects/DiscountCodeNode",
    "fields": discountCodesFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_discount_codes",
    "queryName": "codeDiscountNodes",
    "connectionPath": "codeDiscountNodes",
    "isTimeSeries": false,
    "unionField": "codeDiscount",
    "unionTypes": ["DiscountCodeBasic", "DiscountCodeBxgy", "DiscountCodeFreeShipping"]
  },
  "fulfillment-orders": {
    "overview": "Fulfillment Orders",
    "description": "Fulfillment orders representing items to be fulfilled from a location.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-10/objects/FulfillmentOrder",
    "fields": fulfillmentOrdersFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_fulfillment_orders",
    "queryName": "fulfillmentOrders",
    "connectionPath": "fulfillmentOrders",
    "isTimeSeries": false
  },
  "inventory-items": {
    "overview": "Inventory Items",
    "description": "Inventory items representing SKUs.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-10/objects/InventoryItem",
    "fields": inventoryItemsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_inventory_items",
    "queryName": "inventoryItems",
    "connectionPath": "inventoryItems",
    "isTimeSeries": false
  },
  "locations": {
    "overview": "Locations",
    "description": "Physical or virtual locations for inventory and fulfillment.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-10/objects/Location",
    "fields": locationsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_locations",
    "queryName": "locations",
    "connectionPath": "locations",
    "isTimeSeries": false
  },
  "orders": {
    "overview": "Orders",
    "description": "Orders placed in the store.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-10/objects/Order",
    "fields": ordersFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_orders",
    "queryName": "orders",
    "connectionPath": "orders",
    "isTimeSeries": true,
    "queryFilterTemplate": "query: \"updated_at:>='{{startDate}}' AND updated_at:<='{{endDate}}'\""
  },
  "products": {
    "overview": "Products",
    "description": "Products in the store catalog.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-10/objects/Product",
    "fields": productsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_products",
    "queryName": "products",
    "connectionPath": "products",
    "isTimeSeries": true,
    "queryFilterTemplate": "query: \"updated_at:>='{{startDate}}' AND updated_at:<='{{endDate}}'\""
  },
  "product-variants": {
    "overview": "Product Variants",
    "description": "Variants of products.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-10/objects/ProductVariant",
    "fields": productVariantsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_product_variants",
    "queryName": "productVariants",
    "connectionPath": "productVariants",
    "isTimeSeries": false
  },
  "pages": {
    "overview": "Pages",
    "description": "Static pages in the store.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-10/objects/Page",
    "fields": pagesFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_pages",
    "queryName": "pages",
    "connectionPath": "pages",
    "isTimeSeries": false
  },
  "shop": {
    "overview": "Shop",
    "description": "Shop settings and information.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-10/objects/Shop",
    "fields": shopFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_shop",
    "queryName": "shop",
    "connectionPath": "shop",
    "isSingleton": true,
    "isTimeSeries": false
  },
  "tender-transactions": {
    "overview": "Tender Transactions",
    "description": "Tender transactions for payments.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-10/objects/TenderTransaction",
    "fields": tenderTransactionsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_tender_transactions",
    "queryName": "tenderTransactions",
    "connectionPath": "tenderTransactions",
    "isTimeSeries": false
  },
  "metafield-articles": {
    "overview": "Article Metafields",
    "description": "Custom metafields for articles.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-10/objects/Metafield",
    "fields": metafieldsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_metafield_articles",
    "ownerType": "ARTICLE",
    "parentQuery": "articles",
    "isTimeSeries": false
  },
  "metafield-blogs": {
    "overview": "Blog Metafields",
    "description": "Custom metafields for blogs.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-10/objects/Metafield",
    "fields": metafieldsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_metafield_blogs",
    "ownerType": "BLOG",
    "parentQuery": "blogs",
    "isTimeSeries": false
  },
  "metafield-collections": {
    "overview": "Collection Metafields",
    "description": "Custom metafields for collections.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-10/objects/Metafield",
    "fields": metafieldsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_metafield_collections",
    "ownerType": "COLLECTION",
    "parentQuery": "collections",
    "isTimeSeries": false
  },
  "metafield-customers": {
    "overview": "Customer Metafields",
    "description": "Custom metafields for customers.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-10/objects/Metafield",
    "fields": metafieldsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_metafield_customers",
    "ownerType": "CUSTOMER",
    "parentQuery": "customers",
    "isTimeSeries": false
  },
  "metafield-locations": {
    "overview": "Location Metafields",
    "description": "Custom metafields for locations.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-10/objects/Metafield",
    "fields": metafieldsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_metafield_locations",
    "ownerType": "LOCATION",
    "parentQuery": "locations",
    "isTimeSeries": false
  },
  "metafield-orders": {
    "overview": "Order Metafields",
    "description": "Custom metafields for orders.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-10/objects/Metafield",
    "fields": metafieldsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_metafield_orders",
    "ownerType": "ORDER",
    "parentQuery": "orders",
    "isTimeSeries": false
  },
  "metafield-pages": {
    "overview": "Page Metafields",
    "description": "Custom metafields for pages.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-10/objects/Metafield",
    "fields": metafieldsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_metafield_pages",
    "ownerType": "PAGE",
    "parentQuery": "pages",
    "isTimeSeries": false
  },
  "metafield-product-variants": {
    "overview": "Product Variant Metafields",
    "description": "Custom metafields for product variants.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-10/objects/Metafield",
    "fields": metafieldsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_metafield_product_variants",
    "ownerType": "PRODUCTVARIANT",
    "parentQuery": "productVariants",
    "isTimeSeries": false
  },
  "metafield-products": {
    "overview": "Product Metafields",
    "description": "Custom metafields for products.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-10/objects/Metafield",
    "fields": metafieldsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_metafield_products",
    "ownerType": "PRODUCT",
    "parentQuery": "products",
    "isTimeSeries": false
  },
  "metafield-shops": {
    "overview": "Shop Metafields",
    "description": "Custom metafields for the shop.",
    "documentation": "https://shopify.dev/docs/api/admin-graphql/2025-10/objects/Metafield",
    "fields": metafieldsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_metafield_shops",
    "ownerType": "SHOP",
    "parentQuery": null,
    "isTimeSeries": false
  }
};
