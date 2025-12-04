/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var ShopifyAdsSource = class ShopifyAdsSource extends AbstractSource {
  constructor(config) {
    super(config.mergeParameters({
      ShopDomain: {
        isRequired: true,
        requiredType: "string",
        label: "Shop Domain",
        description: "Shopify shop domain, e.g. example-store.myshopify.com"
      },
      AccessToken: {
        isRequired: true,
        requiredType: "string",
        label: "Admin API Access Token",
        description: "Private or custom app Admin API access token",
        attributes: [CONFIG_ATTRIBUTES.SECRET]
      },
      Fields: {
        isRequired: true,
        requiredType: "string",
        label: "Fields",
        description: "Comma separated list in format 'node field'. Example: orders id, orders totalPrice"
      },
      CreateEmptyTables: {
        requiredType: "boolean",
        default: true,
        label: "Create Empty Tables",
        description: "Create tables with all schema columns even when API returned zero rows",
        attributes: [CONFIG_ATTRIBUTES.ADVANCED]
      }
    }));

    this.fieldsSchema = ShopifyAdsFieldsSchema;
  }

  /**
   * Entry point used by connectors to fetch Shopify data.
   */
  async fetchData({ nodeName, fields = [] }) {
    if (!nodeName) {
      throw new Error("nodeName is required to fetch Shopify data");
    }

    const schema = this.fieldsSchema[nodeName];
    if (!schema) {
      throw new Error(`Unknown node '${nodeName}' for Shopify source`);
    }

    // Metafield nodes
    if (nodeName.startsWith("metafield-")) {
      return await this._fetchMetafieldsForNode({ nodeName, schema, requestedFields: fields });
    }

    // Discount codes (special handling for union type)
    if (nodeName === "discount-codes") {
      return await this._fetchDiscountCodes({ nodeName, schema, requestedFields: fields });
    }

    // Singleton (shop)
    if (schema.isSingleton) {
      return await this._fetchSingleton({ nodeName, schema, requestedFields: fields });
    }

    // Nested field nodes (transactions, refunds inside orders)
    if (schema.nestedField) {
      return await this._fetchNestedField({ nodeName, schema, requestedFields: fields });
    }

    // Nested query nodes (disputes, balance-transactions inside shopifyPaymentsAccount)
    if (schema.nestedQuery) {
      return await this._fetchNestedQuery({ nodeName, schema, requestedFields: fields });
    }

    // Standard GraphQL nodes
    return await this._fetchGenericGraphQL({ nodeName, schema, requestedFields: fields });
  }

  /**
   * Generic GraphQL fetch that builds query dynamically based on requested fields.
   */
  async _fetchGenericGraphQL({ nodeName, schema, requestedFields }) {
    const keepFields = this._resolveFieldsSet({ nodeName, requestedFields });
    const graphqlFields = this._buildGraphQLFieldsFromSchema({ schema, keepFields });
    
    const collected = [];
    let hasNextPage = true;
    let cursor = null;

    while (hasNextPage) {
      const afterClause = cursor ? `, after: "${cursor}"` : "";
      const filterClause = schema.queryFilter ? `, ${schema.queryFilter}` : "";
      const query = `query { ${schema.queryName}(first: 250${afterClause}${filterClause}) { nodes { ${graphqlFields} } pageInfo { hasNextPage endCursor } } }`;
      
      const payload = await this._graphqlRequest(query);
      const connection = this._getNestedValue(payload?.data, schema.connectionPath);
      if (!connection) break;

      const nodes = connection.nodes || connection.edges?.map(e => e.node) || [];
      for (const node of nodes) {
        const normalized = this._normalizeFromSchema({ node, schema, keepFields });
        collected.push(normalized);
      }

      hasNextPage = connection.pageInfo?.hasNextPage || false;
      cursor = connection.pageInfo?.endCursor || null;
    }

    console.log(`[Shopify] Fetched ${collected.length} records for ${nodeName}`);
    return collected;
  }

  /**
   * Fetch singleton resources like shop.
   */
  async _fetchSingleton({ nodeName, schema, requestedFields }) {
    const keepFields = this._resolveFieldsSet({ nodeName, requestedFields });
    const graphqlFields = this._buildGraphQLFieldsFromSchema({ schema, keepFields });
    
    const query = `query { ${schema.queryName} { ${graphqlFields} } }`;
    const payload = await this._graphqlRequest(query);
    const node = payload?.data?.[schema.queryName];
    if (!node) {
      console.log(`[Shopify] Fetched 0 records for ${nodeName}`);
      return [];
    }

    console.log(`[Shopify] Fetched 1 record for ${nodeName}`);
    return [this._normalizeFromSchema({ node, schema, keepFields })];
  }

  /**
   * Fetch nested fields (e.g., transactions inside orders).
   */
  async _fetchNestedField({ nodeName, schema, requestedFields }) {
    const keepFields = this._resolveFieldsSet({ nodeName, requestedFields });
    const graphqlFields = this._buildGraphQLFieldsFromSchema({ schema, keepFields });
    
    const collected = [];
    let hasNextPage = true;
    let cursor = null;

    while (hasNextPage) {
      const afterClause = cursor ? `, after: "${cursor}"` : "";
      const query = `query { ${schema.queryName}(first: 50${afterClause}) { nodes { id ${schema.nestedField}(first: 100) { nodes { ${graphqlFields} } } } pageInfo { hasNextPage endCursor } } }`;
      
      const payload = await this._graphqlRequest(query);
      const connection = this._getNestedValue(payload?.data, schema.connectionPath);
      if (!connection) break;

      for (const parent of (connection.nodes || [])) {
        const nested = parent[schema.nestedField]?.nodes || [];
        for (const node of nested) {
          const normalized = this._normalizeFromSchema({ node, schema, keepFields });
          collected.push(normalized);
        }
      }

      hasNextPage = connection.pageInfo?.hasNextPage || false;
      cursor = connection.pageInfo?.endCursor || null;
    }

    console.log(`[Shopify] Fetched ${collected.length} records for ${nodeName}`);
    return collected;
  }

  /**
   * Fetch nested query nodes (e.g., disputes inside shopifyPaymentsAccount).
   */
  async _fetchNestedQuery({ nodeName, schema, requestedFields }) {
    const keepFields = this._resolveFieldsSet({ nodeName, requestedFields });
    const graphqlFields = this._buildGraphQLFieldsFromSchema({ schema, keepFields });
    
    const collected = [];
    let hasNextPage = true;
    let cursor = null;

    while (hasNextPage) {
      const afterClause = cursor ? `, after: "${cursor}"` : "";
      const query = `query { ${schema.queryName} { ${schema.nestedQuery}(first: 250${afterClause}) { nodes { ${graphqlFields} } pageInfo { hasNextPage endCursor } } } }`;
      
      const payload = await this._graphqlRequest(query);
      const connection = this._getNestedValue(payload?.data, schema.connectionPath);
      if (!connection) break;

      const nodes = connection.nodes || [];
      for (const node of nodes) {
        const normalized = this._normalizeFromSchema({ node, schema, keepFields });
        collected.push(normalized);
      }

      hasNextPage = connection.pageInfo?.hasNextPage || false;
      cursor = connection.pageInfo?.endCursor || null;
    }

    console.log(`[Shopify] Fetched ${collected.length} records for ${nodeName}`);
    return collected;
  }

  /**
   * Build GraphQL fields string from schema based on requested fields.
   */
  _buildGraphQLFieldsFromSchema({ schema, keepFields }) {
    const graphqlParts = new Set();
    
    for (const field of keepFields) {
      const fieldDef = schema.fields[field];
      if (fieldDef?.graphqlPath) {
        graphqlParts.add(fieldDef.graphqlPath);
      }
    }

    // Always include id
    graphqlParts.add("id");

    return this._mergeNestedFields([...graphqlParts]);
  }

  /**
   * Merge nested GraphQL fields to avoid duplication.
   */
  _mergeNestedFields(fields) {
    const nested = {};
    const simple = [];

    for (const field of fields) {
      // Handle deeply nested paths like "customer { id }" or "totalPriceSet { shopMoney { amount } }"
      const match = field.match(/^(\w+)\s*\{\s*(.+)\s*\}$/);
      if (match) {
        const [, parent, inner] = match;
        if (!nested[parent]) nested[parent] = [];
        nested[parent].push(inner.trim());
      } else {
        simple.push(field);
      }
    }

    const result = [...simple];
    for (const [parent, innerParts] of Object.entries(nested)) {
      // Recursively merge inner parts
      const merged = this._mergeNestedFields(innerParts);
      result.push(`${parent} { ${merged} }`);
    }

    return result.join(" ");
  }

  /**
   * Normalize node data based on schema graphqlPath.
   */
  _normalizeFromSchema({ node, schema, keepFields }) {
    if (!node) return {};
    
    const result = {};
    
    for (const field of keepFields) {
      const fieldDef = schema.fields[field];
      if (!fieldDef?.graphqlPath) {
        result[field] = null;
        continue;
      }

      const value = this._extractValueFromPath(node, fieldDef.graphqlPath);
      result[field] = this._castValue(value);
    }

    return result;
  }

  /**
   * Extract value from node using GraphQL path.
   */
  _extractValueFromPath(node, graphqlPath) {
    // Handle nested paths like "customer { email }" or "totalPriceSet { shopMoney { amount } }"
    const match = graphqlPath.match(/^(\w+)\s*\{\s*(.+)\s*\}$/);
    if (match) {
      const [, parent, inner] = match;
      const parentValue = node[parent];
      if (!parentValue) return null;
      
      // Recursively extract from inner path
      return this._extractValueFromPath(parentValue, inner.trim());
    }
    
    // Handle multiple fields in same level (e.g., "amount currencyCode")
    const parts = graphqlPath.split(/\s+/);
    if (parts.length > 1) {
      // Return first field value
      return node[parts[0]];
    }
    
    return node[graphqlPath];
  }

  /**
   * Cast value for storage compatibility.
   */
  _castValue(value) {
    if (value == null) return null;
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "object") return JSON.stringify(value);
    return value;
  }

  // ========== Discount Codes (union type) ==========

  async _fetchDiscountCodes({ nodeName, schema, requestedFields }) {
    const keepFields = this._resolveFieldsSet({ nodeName, requestedFields });
    const collected = [];
    let hasNextPage = true;
    let cursor = null;

    // Build inline fragments for union type
    const discountFields = `
      __typename
      ... on DiscountCodeBasic {
        title status startsAt endsAt usageLimit appliesOncePerCustomer asyncUsageCount createdAt updatedAt
        codes(first: 1) { nodes { code } }
      }
      ... on DiscountCodeBxgy {
        title status startsAt endsAt usageLimit appliesOncePerCustomer asyncUsageCount createdAt updatedAt
        codes(first: 1) { nodes { code } }
      }
      ... on DiscountCodeFreeShipping {
        title status startsAt endsAt usageLimit appliesOncePerCustomer asyncUsageCount createdAt updatedAt
        codes(first: 1) { nodes { code } }
      }
    `;

    while (hasNextPage) {
      const afterClause = cursor ? `, after: "${cursor}"` : "";
      const query = `query { codeDiscountNodes(first: 250${afterClause}) { nodes { id codeDiscount { ${discountFields} } } pageInfo { hasNextPage endCursor } } }`;
      
      const payload = await this._graphqlRequest(query);
      const connection = payload?.data?.codeDiscountNodes;
      if (!connection) break;

      for (const node of (connection.nodes || [])) {
        collected.push(this._normalizeDiscountCode(node, keepFields));
      }

      hasNextPage = connection.pageInfo?.hasNextPage || false;
      cursor = connection.pageInfo?.endCursor || null;
    }

    console.log(`[Shopify] Fetched ${collected.length} records for ${nodeName}`);
    return collected;
  }

  _normalizeDiscountCode(node, keepFields) {
    const discount = node.codeDiscount || {};
    const code = discount.codes?.nodes?.[0]?.code || null;
    const all = {
      id: node.id || null,
      code: code,
      discountType: discount.__typename || null,
      title: discount.title || null,
      status: discount.status || null,
      startsAt: discount.startsAt || null,
      endsAt: discount.endsAt || null,
      usageLimit: discount.usageLimit || null,
      appliesOncePerCustomer: discount.appliesOncePerCustomer || null,
      asyncUsageCount: discount.asyncUsageCount || null,
      createdAt: discount.createdAt || null,
      updatedAt: discount.updatedAt || null
    };

    const result = {};
    for (const field of keepFields) {
      result[field] = all[field] ?? null;
    }
    return result;
  }

  // ========== Metafields ==========

  async _fetchMetafieldsForNode({ nodeName, schema, requestedFields }) {
    if (schema.parentQuery === null) {
      return await this._fetchShopMetafields({ nodeName, requestedFields });
    }

    const keepFields = this._resolveFieldsSet({ nodeName, requestedFields });
    const collected = [];
    let hasNextPage = true;
    let cursor = null;

    while (hasNextPage) {
      const afterClause = cursor ? `, after: "${cursor}"` : "";
      const query = `query { ${schema.parentQuery}(first: 50${afterClause}) { nodes { id metafields(first: 250) { nodes { id namespace key value type description createdAt updatedAt } } } pageInfo { hasNextPage endCursor } } }`;
      const payload = await this._graphqlRequest(query);
      const connection = payload?.data?.[schema.parentQuery];
      if (!connection) break;

      for (const owner of (connection.nodes || [])) {
        for (const mf of (owner.metafields?.nodes || [])) {
          collected.push(this._normalizeMetafield(mf, owner.id, schema.ownerType, keepFields));
        }
      }

      hasNextPage = connection.pageInfo?.hasNextPage || false;
      cursor = connection.pageInfo?.endCursor || null;
    }

    console.log(`[Shopify] Fetched ${collected.length} records for ${nodeName}`);
    return collected;
  }

  async _fetchShopMetafields({ nodeName, requestedFields }) {
    const keepFields = this._resolveFieldsSet({ nodeName, requestedFields });
    const query = `query { shop { id metafields(first: 250) { nodes { id namespace key value type description createdAt updatedAt } } } }`;
    const payload = await this._graphqlRequest(query);
    const shop = payload?.data?.shop;
    if (!shop) {
      console.log(`[Shopify] Fetched 0 records for ${nodeName}`);
      return [];
    }

    const result = (shop.metafields?.nodes || []).map(mf => this._normalizeMetafield(mf, shop.id, "SHOP", keepFields));
    console.log(`[Shopify] Fetched ${result.length} records for ${nodeName}`);
    return result;
  }

  _normalizeMetafield(mf, ownerId, ownerType, keepFields) {
    const all = {
      id: mf.id || null,
      namespace: mf.namespace || null,
      key: mf.key || null,
      value: mf.value || null,
      type: mf.type || null,
      description: mf.description || null,
      ownerId: ownerId || null,
      ownerType: ownerType || null,
      createdAt: mf.createdAt ? new Date(mf.createdAt) : null,
      updatedAt: mf.updatedAt ? new Date(mf.updatedAt) : null
    };

    const result = {};
    for (const field of keepFields) {
      result[field] = all[field] ?? null;
    }
    return result;
  }

  // ========== Utility Methods ==========

  async _graphqlRequest(query) {
    const url = this._buildGraphqlUrl();
    const headers = this._buildHeaders();

    console.log(`[Shopify] Query: ${query}`);

    const response = await this.urlFetchWithRetry(url, {
      method: "post",
      headers,
      body: JSON.stringify({ query }),
      payload: JSON.stringify({ query }),
      muteHttpExceptions: true
    });

    const result = JSON.parse(await response.getContentText());
    
    // Log errors if any
    if (result.errors) {
      console.log(`[Shopify] GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    return result;
  }

  _buildGraphqlUrl() {
    const domain = String(this.config.ShopDomain.value).replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `https://${domain}/admin/api/2025-01/graphql.json`;
  }

  _buildHeaders() {
    return {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": this.config.AccessToken.value
    };
  }

  _getNestedValue(obj, path) {
    return path.split('.').reduce((acc, part) => acc?.[part], obj);
  }

  _resolveFieldsSet({ nodeName, requestedFields = [] }) {
    const schema = this.fieldsSchema[nodeName];
    if (!schema) throw new Error(`Schema for node '${nodeName}' is not defined`);
    return new Set([...(schema.uniqueKeys || []), ...requestedFields]);
  }

  isValidToRetry(error) {
    if (!error?.statusCode) return true;
    if (error.statusCode >= HTTP_STATUS.SERVER_ERROR_MIN) return true;
    if ([HTTP_STATUS.TOO_MANY_REQUESTS, HTTP_STATUS.SERVICE_UNAVAILABLE, HTTP_STATUS.GATEWAY_TIMEOUT].includes(error.statusCode)) return true;
    return false;
  }
};
