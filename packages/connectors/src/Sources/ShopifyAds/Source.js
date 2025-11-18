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
        description: "Private or custom app Admin API access token with marketing_event scopes",
        attributes: [CONFIG_ATTRIBUTES.SECRET]
      },
      ApiVersion: {
        requiredType: "string",
        default: "2024-10",
        label: "API Version",
        description: "Shopify Admin API version (format YYYY-MM)",
        attributes: [CONFIG_ATTRIBUTES.ADVANCED]
      },
      Fields: {
        isRequired: true,
        requiredType: "string",
        default: "marketing-events id, marketing-events marketing_channel, marketing-events budget, abandoned-checkouts token, abandoned-checkouts email, abandoned-checkouts total_price",
        label: "Fields",
        description: "Comma separated list in format 'node field'. Example: marketing-events id"
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
   * @param {Object} opts
   * @param {string} opts.nodeName
   * @param {Array<string>} opts.fields
   * @returns {Promise<Array<Object>>}
   */
  async fetchData({ nodeName, fields = [] }) {
    if (!nodeName) {
      throw new Error("nodeName is required to fetch Shopify data");
    }

    switch (nodeName) {
      case "marketing-events":
        return await this._fetchMarketingEvents({ requestedFields: fields });
      case "abandoned-checkouts":
        return await this._fetchAbandonedCheckouts({ requestedFields: fields });
      default:
        throw new Error(`Unknown node '${nodeName}' for Shopify Ads source`);
    }
  }

  /**
   * Fetch marketing events via the Admin REST API.
   * @param {Object} options
   * @param {Array<string>} options.requestedFields
   * @returns {Promise<Array<Object>>}
   * @private
   */
  async _fetchMarketingEvents({ requestedFields }) {
    const keepFields = this._resolveFieldsSet({
      nodeName: "marketing-events",
      requestedFields
    });

    const headers = this._buildHeaders();
    let nextUrl = this._buildUrl({
      endpoint: "marketing_events.json",
      params: { limit: 250 }
    });

    const collected = [];

    while (nextUrl) {
      const response = await this.urlFetchWithRetry(nextUrl, {
        method: "get",
        headers,
        muteHttpExceptions: true
      });

      const payload = JSON.parse(await response.getContentText());
      const events = payload?.marketing_events || [];
      const normalized = events.map(event => this._normalizeMarketingEvent(event));
      collected.push(...this._filterRecords({ records: normalized, keepFields }));

      nextUrl = this._extractNextLink(response);
    }

    return collected;
  }

  /**
   * Fetch abandoned checkouts via the Admin REST API.
   * @param {Object} options
   * @param {Array<string>} options.requestedFields
   * @returns {Promise<Array<Object>>}
   * @private
   */
  async _fetchAbandonedCheckouts({ requestedFields }) {
    const keepFields = this._resolveFieldsSet({
      nodeName: "abandoned-checkouts",
      requestedFields
    });

    const headers = this._buildHeaders();
    let nextUrl = this._buildUrl({
      endpoint: "checkouts.json",
      params: {
        status: "abandoned",
        limit: 250
      }
    });

    const collected = [];

    while (nextUrl) {
      const response = await this.urlFetchWithRetry(nextUrl, {
        method: "get",
        headers,
        muteHttpExceptions: true
      });

      const payload = JSON.parse(await response.getContentText());
      const checkouts = payload?.checkouts || [];
      const normalized = checkouts.map(checkout => this._normalizeAbandonedCheckout(checkout));
      collected.push(...this._filterRecords({ records: normalized, keepFields }));

      nextUrl = this._extractNextLink(response);
    }

    return collected;
  }

  /**
   * Normalize Shopify marketing event payload into flat record.
   * @param {Object} event
   * @returns {Object}
   * @private
   */
  _normalizeMarketingEvent(event) {
    if (!event) {
      return {};
    }

    return {
      id: event.id ? String(event.id) : null,
      name: event.name || null,
      event_type: event.event_type || null,
      marketing_channel: event.marketing_channel || null,
      marketing_activity_type: event.marketing_activity_type || null,
      paid: typeof event.paid === "boolean" ? event.paid : null,
      budget: this._parseNumber(event.budget),
      budget_type: event.budget_type || null,
      budget_currency: event.budget_currency || event.budget_currency_code || null,
      currency_code: event.currency_code || event.currency || null,
      started_at: this._parseDate(event.started_at),
      ended_at: this._parseDate(event.ended_at),
      preview_url: event.preview_url || null,
      remote_id: event.remote_id || null,
      utm_campaign: event.utm?.campaign || event.utm_campaign || null,
      utm_source: event.utm?.source || event.utm_source || null,
      utm_medium: event.utm?.medium || event.utm_medium || null,
      utm_term: event.utm?.term || event.utm_term || null,
      utm_content: event.utm?.content || event.utm_content || null,
      created_at: this._parseDate(event.created_at),
      updated_at: this._parseDate(event.updated_at)
    };
  }

  /**
   * Normalize Shopify abandoned checkout payload.
   * @param {Object} checkout
   * @returns {Object}
   * @private
   */
  _normalizeAbandonedCheckout(checkout) {
    if (!checkout) {
      return {};
    }

    const shipping = checkout.shipping_address || {};
    const customer = checkout.customer || {};

    return {
      id: checkout.id ? String(checkout.id) : null,
      token: checkout.token || null,
      abandoned_checkout_url: checkout.abandoned_checkout_url || null,
      cart_token: checkout.cart_token || null,
      completed_at: this._parseDate(checkout.completed_at),
      created_at: this._parseDate(checkout.created_at),
      updated_at: this._parseDate(checkout.updated_at),
      currency: checkout.currency || null,
      presentment_currency: checkout.presentment_currency || null,
      email: checkout.email || null,
      phone: checkout.phone || null,
      order_id: checkout.order_id ? String(checkout.order_id) : null,
      subtotal_price: this._parseNumber(checkout.subtotal_price),
      total_price: this._parseNumber(checkout.total_price),
      total_tax: this._parseNumber(checkout.total_tax),
      total_discounts: this._parseNumber(checkout.total_discounts),
      total_weight: this._parseNumber(checkout.total_weight),
      line_items_count: Array.isArray(checkout.line_items) ? checkout.line_items.length : null,
      shipping_city: shipping.city || null,
      shipping_country: shipping.country || null,
      shipping_province: shipping.province || null,
      shipping_postal_code: shipping.zip || null,
      customer_id: customer.id ? String(customer.id) : null,
      customer_first_name: customer.first_name || null,
      customer_last_name: customer.last_name || null,
      customer_email: customer.email || checkout.email || null,
      customer_phone: customer.phone || checkout.phone || null
    };
  }

  /**
   * Keep only requested fields and unique keys.
   * @param {Object} options
   * @param {Array<Object>} options.records
   * @param {Set<string>} options.keepFields
   * @returns {Array<Object>}
   * @private
   */
  _filterRecords({ records, keepFields }) {
    return records.map(record => {
      const filtered = {};
      keepFields.forEach(field => {
        filtered[field] = field in record ? record[field] : null;
      });
      return filtered;
    });
  }

  /**
   * Utility to cast dates.
   * @param {string|Date|null} value
   * @returns {Date|null}
   * @private
   */
  _parseDate(value) {
    if (!value) {
      return null;
    }
    return value instanceof Date ? value : new Date(value);
  }

  /**
   * Utility to cast numeric strings.
   * @param {string|number|null} value
   * @returns {number|null}
   * @private
   */
  _parseNumber(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    if (typeof value === "number") {
      return value;
    }
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  /**
   * Combine requested fields with schema unique keys.
   * @param {Object} options
   * @param {string} options.nodeName
   * @param {Array<string>} options.requestedFields
   * @returns {Set<string>}
   * @private
   */
  _resolveFieldsSet({ nodeName, requestedFields = [] }) {
    const schema = this.fieldsSchema[nodeName];
    if (!schema) {
      throw new Error(`Schema for node '${nodeName}' is not defined`);
    }

    return new Set([...(schema.uniqueKeys || []), ...requestedFields]);
  }

  /**
   * Build Shopify REST URL with query params.
   * @param {Object} options
   * @param {string} options.endpoint
   * @param {Object} [options.params]
   * @returns {string}
   * @private
   */
  _buildUrl({ endpoint, params = {} }) {
    const domain = String(this.config.ShopDomain.value)
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
    const version = this.config.ApiVersion?.value || "2024-10";
    const query = Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join("&");

    return `https://${domain}/admin/api/${version}/${endpoint}${query ? `?${query}` : ""}`;
  }

  /**
   * Headers required for Shopify Admin REST API.
   * @returns {Object}
   * @private
   */
  _buildHeaders() {
    return {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": this.config.AccessToken.value
    };
  }

  /**
   * Extracts pagination link with rel="next".
   * @param {HTTPResponse} response
   * @returns {string|null}
   * @private
   */
  _extractNextLink(response) {
    if (typeof response.getHeaders !== "function") {
      return null;
    }

    const headers = response.getHeaders();
    const linkHeader = headers?.Link || headers?.link;
    if (!linkHeader) {
      return null;
    }

    const nextPart = linkHeader
      .split(",")
      .map(part => part.trim())
      .find(part => part.includes('rel="next"'));

    if (!nextPart) {
      return null;
    }

    const match = nextPart.match(/<([^>]+)>/);
    return match ? match[1] : null;
  }

  /**
   * Custom retry logic for Shopify REST API.
   * @param {HttpRequestException} error
   * @returns {boolean}
   */
  isValidToRetry(error) {
    if (!error?.statusCode) {
      return true;
    }

    if (error.statusCode >= HTTP_STATUS.SERVER_ERROR_MIN) {
      return true;
    }

    if (error.statusCode === HTTP_STATUS.TOO_MANY_REQUESTS ||
        error.statusCode === HTTP_STATUS.SERVICE_UNAVAILABLE ||
        error.statusCode === HTTP_STATUS.GATEWAY_TIMEOUT) {
      return true;
    }

    return false;
  }
};

