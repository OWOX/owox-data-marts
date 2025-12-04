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
      ReimportLookbackWindow: {
        requiredType: "number",
        isRequired: true,
        default: 2,
        label: "Reimport Lookback Window",
        description: "Number of days to look back when reimporting data",
        attributes: [CONFIG_ATTRIBUTES.ADVANCED]
      },
      CreateEmptyTables: {
        requiredType: "boolean",
        default: true,
        label: "Create Empty Tables",
        description: "Create tables with all schema columns even when API returned zero rows",
        attributes: [CONFIG_ATTRIBUTES.ADVANCED]
      },
      StartDate: {
        requiredType: "date",
        label: "Start Date",
        description: "Start date for data import",
        attributes: [CONFIG_ATTRIBUTES.MANUAL_BACKFILL, CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM]
      },
      EndDate: {
        requiredType: "date",
        label: "End Date",
        description: "End date for data import",
        attributes: [CONFIG_ATTRIBUTES.MANUAL_BACKFILL, CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM]
      },
    }));

    this.fieldsSchema = ShopifyAdsFieldsSchema;
  }

  /**
   * Entry point to fetch Shopify data.
   */
  async fetchData({ nodeName, fields = [], startDate = null, endDate = null }) {
    const schema = this.fieldsSchema[nodeName];

    if (nodeName.startsWith("metafield-")) {
      return this._fetchMetafields({ nodeName, schema, fields });
    }

    if (schema.isSingleton) {
      return this._fetchSingleton({ nodeName, schema, fields });
    }

    if (schema.nestedField) {
      return this._fetchPaginated({
        nodeName,
        schema,
        fields,
        startDate,
        endDate,
        buildQuery: (afterClause, filterClause, graphqlFields) => 
          `query { ${schema.queryName}(first: 50${afterClause}${filterClause}) { nodes { id ${schema.nestedField}(first: 100) { nodes { ${graphqlFields} } } } pageInfo { hasNextPage endCursor } } }`,
        extractNodes: (connection) => {
          const results = [];
          for (const parent of (connection.nodes || [])) {
            results.push(...(parent[schema.nestedField]?.nodes || []));
          }
          return results;
        }
      });
    }

    return this._fetchPaginated({
      nodeName,
      schema,
      fields,
      startDate,
      endDate,
      buildQuery: (afterClause, filterClause, graphqlFields) =>
        `query { ${schema.queryName}(first: 250${afterClause}${filterClause}) { nodes { ${graphqlFields} } pageInfo { hasNextPage endCursor } } }`,
      extractNodes: (connection) => connection.nodes || []
    });
  }

  /**
   * Generic paginated fetch with customizable query and node extraction.
   */
  async _fetchPaginated({ nodeName, schema, fields, startDate, endDate, buildQuery, extractNodes }) {
    const queryFields = this._buildQueryFields(schema, fields);
    const dateFilter = this._buildDateFilter(schema, startDate, endDate);
    const normalizer = schema.normalizer 
      ? (node) => this._filterFields(schema.normalizer(node), fields)
      : (node) => this._normalizeFromSchema({ node, schema, fields });

    const results = [];
    let cursor = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const afterClause = cursor ? `, after: "${cursor}"` : "";
      const query = buildQuery(afterClause, dateFilter, queryFields);

      const payload = await this._graphqlRequest(query);
      const connection = payload?.data?.[schema.connectionPath];
      if (!connection) {
        break;
      }

      for (const node of extractNodes(connection)) {
        results.push(normalizer(node));
      }

      hasNextPage = connection.pageInfo?.hasNextPage || false;
      cursor = connection.pageInfo?.endCursor || null;
    }

    console.log(`[Shopify] Fetched ${results.length} records for ${nodeName}`);
    return results;
  }

  /**
   * Fetch singleton (shop).
   */
  async _fetchSingleton({ nodeName, schema, fields }) {
    const queryFields = this._buildQueryFields(schema, fields);
    const query = `query { ${schema.queryName} { ${queryFields} } }`;

    const payload = await this._graphqlRequest(query);
    const node = payload?.data?.[schema.queryName];

    console.log(`[Shopify] Fetched ${node ? 1 : 0} records for ${nodeName}`);
    return node ? [this._normalizeFromSchema({ node, schema, fields })] : [];
  }

  /**
   * Fetch metafields for various owner types.
   * Shop metafields: single query (shop is singleton)
   * Other metafields: paginate through parent entities (products, orders, etc.)
   */
  async _fetchMetafields({ nodeName, schema, fields }) {
    const queryFields = this._buildQueryFields(schema, fields);
    const isShopMetafields = schema.parentQuery === null;
    const includeOwnerId = fields.includes("ownerId");

    if (isShopMetafields) {
      // TODO: Add pagination for metafields if shop has > 250 metafields
      const query = `query { shop { id metafields(first: 250) { nodes { ${queryFields} } } } }`;
      const payload = await this._graphqlRequest(query);
      const shopId = payload?.data?.shop?.id || null;
      const metafields = payload?.data?.shop?.metafields?.nodes || [];

      console.log(`[Shopify] Fetched ${metafields.length} records for ${nodeName}`);

      return metafields.map(mf => {
        const normalized = this._normalizeFromSchema({ node: mf, schema, fields });
        if (includeOwnerId) {
          normalized.ownerId = shopId;
        }
        return normalized;
      });
    }

    const metafields = [];
    let cursor = null;

    do {
      const afterClause = cursor ? `, after: "${cursor}"` : "";
      // TODO: Add pagination for metafields if owner has > 250 metafields (currently only first 250 are fetched)
      const query = `query { ${schema.parentQuery}(first: 250${afterClause}) { nodes { id metafields(first: 250) { nodes { ${queryFields} } } } pageInfo { hasNextPage endCursor } } }`;

      const payload = await this._graphqlRequest(query);
      const connection = payload?.data?.[schema.parentQuery];
      if (!connection) {
        break;
      }

      for (const owner of (connection.nodes || [])) {
        for (const metafield of (owner.metafields?.nodes || [])) {
          const normalized = this._normalizeFromSchema({ node: metafield, schema, fields });
          if (includeOwnerId) {
            normalized.ownerId = owner.id;
          }
          metafields.push(normalized);
        }
      }

      cursor = connection.pageInfo?.hasNextPage ? connection.pageInfo.endCursor : null;
    } while (cursor);

    console.log(`[Shopify] Fetched ${metafields.length} records for ${nodeName}`);
    return metafields;
  }

  // ========== Data Processing ==========

  _normalizeFromSchema({ node, schema, fields }) {
    if (!node) {
      return {};
    }

    const result = {};
    for (const field of fields) {
      const fieldDefinition = schema.fields[field];
      if (!fieldDefinition?.graphqlPath) {
        result[field] = null;
        continue;
      }
      const rawValue = this._extractValue(node, fieldDefinition.graphqlPath);
      result[field] = this._formatValue(rawValue);
    }
    return result;
  }

  _extractValue(node, graphqlPath) {
    const match = graphqlPath.match(/^(\w+)\s*\{\s*(.+)\s*\}$/);
    if (match) {
      const [, parent, inner] = match;
      return node[parent] ? this._extractValue(node[parent], inner.trim()) : null;
    }
    return node[graphqlPath.split(/\s+/)[0]];
  }

  /**
   * Converts arrays and objects to strings for storage compatibility.
   */
  _formatValue(value) {
    if (value == null) {
      return null;
    }
    if (Array.isArray(value)) {
      return value.join(", ");
    }
    if (typeof value === "object") {
      return JSON.stringify(value);
    }
    return value;
  }

  _filterFields(all, fields) {
    const result = {};
    for (const field of fields) {
      result[field] = all[field] ?? null;
    }
    return result;
  }

  // ========== Query Builders ==========

  /**
   * Builds GraphQL fields string from requested fields.
   * Handles union types (like discount-codes) with inline fragments.
   */
  _buildQueryFields(schema, fields) {
    const regularFields = [];
    const unionTypeFields = [];

    // Separate regular fields from union type fields
    for (const field of fields) {
      const fieldDefinition = schema.fields[field];
      if (!fieldDefinition?.graphqlPath) {
        continue;
      }

      if (fieldDefinition.isUnionField) {
        unionTypeFields.push(fieldDefinition.graphqlPath);
      } else {
        regularFields.push(fieldDefinition.graphqlPath);
      }
    }

    let queryFields = regularFields.join(" ");

    // Add inline fragments for union types (e.g., discount-codes)
    // Before: "id"
    // After:  "id codeDiscount { __typename ... on DiscountCodeBasic { title status } ... on DiscountCodeBxgy { title status } }"
    if (schema.unionField && unionTypeFields.length) {
      const unionFieldsString = unionTypeFields.join(" ");
      const inlineFragments = schema.unionTypes
        .map(typeName => `... on ${typeName} { ${unionFieldsString} }`)
        .join(" ");
      queryFields += ` ${schema.unionField} { __typename ${inlineFragments} }`;
    }

    return queryFields;
  }

  _buildDateFilter(schema, startDate, endDate) {
    if (schema.queryFilter && !schema.queryFilterTemplate) {
      return `, ${schema.queryFilter}`;
    }
    if (schema.queryFilterTemplate && startDate && endDate) {
      return `, ${schema.queryFilterTemplate.replace("{{startDate}}", startDate).replace("{{endDate}}", endDate)}`;
    }
    return "";
  }

  // ========== HTTP ==========

  async _graphqlRequest(query) {
    const url = this._buildGraphqlUrl();
    console.log(`[Shopify] Query: ${query}`);

    const response = await this.urlFetchWithRetry(url, {
      method: "post",
      headers: this._buildHeaders(),
      body: JSON.stringify({ query }),
      payload: JSON.stringify({ query }),
      muteHttpExceptions: true
    });

    const result = JSON.parse(await response.getContentText());
    if (result.errors?.length) {
      const errorMessages = result.errors.map(e => e.message).join("; ");
      throw new Error(`[Shopify] GraphQL errors: ${errorMessages}`);
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

  isValidToRetry(error) {
    return !error?.statusCode
      || error.statusCode >= HTTP_STATUS.SERVER_ERROR_MIN
      || [HTTP_STATUS.TOO_MANY_REQUESTS, HTTP_STATUS.SERVICE_UNAVAILABLE, HTTP_STATUS.GATEWAY_TIMEOUT].includes(error.statusCode);
  }
};
