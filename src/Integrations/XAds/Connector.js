/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var XAdsConnector = class XAdsConnector extends AbstractConnector {
  constructor(config) {
    super(config.mergeParameters({
      ConsumerKey: {
        isRequired: true,
        requiredType: "string",
        displayName: "Consumer Key (API Key)",
        description: "Your X Ads API Consumer Key"
      },
      ConsumerSecret: {
        isRequired: true,
        requiredType: "string",
        displayName: "Consumer Secret (API Secret)",
        description: "Your X Ads API Consumer Secret"
      },
      AccessToken: {
        isRequired: true,
        requiredType: "string",
        displayName: "Access Token",
        description: "Your X Ads API Access Token"
      },
      AccessTokenSecret: {
        isRequired: true,
        requiredType: "string",
        displayName: "Access Token Secret",
        description: "Your X Ads API Access Token Secret"
      },
      AccountIDs: {
        isRequired: true,
        requiredType: "string",
        displayName: "Account ID",
        description: "Your X Ads Account ID"
      },
      ReimportLookbackWindow: {
        requiredType: "number",
        isRequired: true,
        default: 2,
        displayName: "Reimport Lookback Window",
        description: "Number of days to look back when reimporting data"
      },
      CleanUpToKeepWindow: {
        requiredType: "number",
        displayName: "Clean Up To Keep Window",
        description: "Number of days to keep data before cleaning up"
      },
      MaxFetchingDays: {
        requiredType: "number",
        isRequired: true,
        default: 31,
        displayName: "Max Fetching Days",
        description: "Maximum number of days to fetch data for"
      },
      BaseUrl: {
        requiredType: "string",
        default: "https://ads-api.x.com/",
        displayName: "Base URL",
        description: "X Ads API base URL"
      },
      Version: {
        requiredType: "string",
        default: "12",
        displayName: "API Version",
        description: "X Ads API version"
      },
      DataMaxCount: {
        requiredType: "number",
        default: 1000,
        displayName: "Max Data Count",
        description: "Maximum number of records to fetch per request"
      },
      CardsMaxCountPerRequest: {
        requiredType: "number",
        default: 20,
        displayName: "Max Cards Per Request",
        description: "Maximum number of cards to fetch per request"
      },
      AdsApiDelay: {
        requiredType: "number",
        default: 3.65,
        displayName: "API Delay (seconds)",
        description: "Delay between API requests in seconds"
      },
      StatsMaxEntityIds: {
        requiredType: "number",
        default: 20,
        displayName: "Max Stats Entity IDs",
        description: "Maximum number of entity_ids allowed per request for stats endpoint"
      }
    }));

    this.fieldsSchema = XAdsFieldsSchema;
    this._tweetsCache = new Map(); // Map<accountId, {data: Array, fields: Set}>
    this._promotedTweetsCache = new Map(); // Map<accountId, {data: Array, fields: Set}>
  }

  /**
   * Returns credential fields for this connector
   */
  getCredentialFields() {
    return {
      ConsumerKey: this.config.ConsumerKey,
      ConsumerSecret: this.config.ConsumerSecret,
      AccessToken: this.config.AccessToken,
      AccessTokenSecret: this.config.AccessTokenSecret
    };
  }

  /**
   * Single entry point for *all* fetches.
   * @param {Object} opts
   * @param {string} opts.nodeName
   * @param {string} opts.accountId
   * @param {Array<string>} opts.fields
   * @param {string} [opts.start_time]
   * @param {string} [opts.end_time]
   * @returns {Array<Object>}
   */
  fetchData({ nodeName, accountId, fields = [], start_time, end_time }) {
    EnvironmentAdapter.sleep(this.config.AdsApiDelay.value * 1000);

    switch (nodeName) {
      case 'accounts': {
        const resp = this._getData(`accounts/${accountId}`, 'accounts', fields);
        return [resp.data];
      }
      case 'campaigns':
      case 'line_items':
      case 'promoted_tweets':
      case 'tweets':
        return this._catalogFetch({
          nodeName,
          accountId,
          fields,
          pageSize: this.config.DataMaxCount.value
        });

      case 'cards':
        return this._catalogFetch({
          nodeName,
          accountId,
          fields,
          pageSize: this.config.CardsMaxCountPerRequest.value
        });

      case 'cards_all':
        return this._fetchAllCards(accountId, fields);

      case 'stats':
        return this._timeSeriesFetch({ nodeName, accountId, fields, start_time, end_time });

      default:
        throw new ConfigurationError(`Unknown node: ${nodeName}`);
    }
  }

  /**
   * Get cached data if all requested fields are present
   * @param {Map} cache - Cache map to check
   * @param {string} accountId - Account ID to look up
   * @param {Array<string>} fields - Required fields
   * @returns {Array|null} - Cached data or null if not found/invalid
   * @private
   */
  _getCachedData(cache, accountId, fields) {
    if (!cache.has(accountId)) return null;

    const cached = cache.get(accountId);
    const hasAllFields = fields.every(field => cached.fields.has(field));
    
    return hasAllFields ? cached.data : null;
  }

  /**
   * Store data in cache with its fields
   * @param {Map} cache - Cache map to store in
   * @param {string} accountId - Account ID as key
   * @param {Array} data - Data to cache
   * @param {Array<string>} fields - Fields present in the data
   * @private
   */
  _setCacheData(cache, accountId, data, fields) {
    cache.set(accountId, {
      data,
      fields: new Set(fields)
    });
  }

  /**
   * Shared logic for non-time-series endpoints
   */
  _catalogFetch({ nodeName, accountId, fields, pageSize }) {
    const uniqueKeys = this.fieldsSchema[nodeName].uniqueKeys || [];
    const missingKeys = uniqueKeys.filter(key => !fields.includes(key));
    
    if (missingKeys.length > 0) {
      throw new Error(`Missing required unique fields for endpoint '${nodeName}'. Missing fields: ${missingKeys.join(', ')}`);
    }

    if (nodeName === 'promoted_tweets') {
      const cached = this._getCachedData(this._promotedTweetsCache, accountId, fields);
      if (cached) {
        console.log('returning cached promoted_tweets');
        return cached;
      };
      console.log('deleting cached promoted_tweets');
      this._promotedTweetsCache.delete(accountId);
    }
    
    if (nodeName === 'tweets') {
      const cached = this._getCachedData(this._tweetsCache, accountId, fields);
      if (cached) {
        console.log('returning cached tweets');
        return cached;
      };
      console.log('deleting cached tweets');
      this._tweetsCache.delete(accountId);
    }

    const all = this._fetchPages({
      accountId,
      nodeName,
      fields,
      extraParams: nodeName === 'tweets'
        ? { tweet_type: 'PUBLISHED', timeline_type: 'NULLCAST', trim_user: true }
        : {},
      pageSize
    });

    if (nodeName === 'promoted_tweets') {
      this._setCacheData(this._promotedTweetsCache, accountId, all, fields);
    }
    if (nodeName === 'tweets') {
      this._setCacheData(this._tweetsCache, accountId, all, fields);
    }

    return all;
  }

  /**
   * Shared pagination logic
   */
  _fetchPages({ accountId, nodeName, fields, extraParams = {}, pageSize }) {
    const all = [];
    let cursor = null;
    const MAX_PAGES = 100;
    let page = 1;

    do {
      const params = {
        count: pageSize,
        ...extraParams,
        ...(cursor ? { cursor } : {})
      };

      const resp = this._getData(
        `accounts/${accountId}/${nodeName}`,
        nodeName,
        fields,
        params
      );

      if (Array.isArray(resp.data)) {
        all.push(...resp.data);
        cursor = resp.next_cursor || null;
      } else {
        all.push(resp.data);
        break;
      }
      page++;
    } while (cursor && page <= MAX_PAGES);

    return all;
  }

  /**
   * Fetch all cards by first collecting URIs from tweets,
   * then calling the cards/all endpoint in chunks.
   */
  _fetchAllCards(accountId, fields) {
    const tweets = this.fetchData({ nodeName: 'tweets', accountId, fields: ['id', 'card_uri'] });
    const uris   = tweets.map(t => t.card_uri).filter(Boolean);
    if (!uris.length) return [];

    const all = [];
    const chunkSize = this.config.CardsMaxCountPerRequest.value;
    for (let i = 0; i < uris.length; i += chunkSize) {
      const chunk = uris.slice(i, i + chunkSize);
      const resp  = this._getData(
        `accounts/${accountId}/cards/all`,
        'cards_all',
        fields,
        { card_uris: chunk.join(','), with_deleted: true }
      );
      if (Array.isArray(resp.data)) {
        all.push(...resp.data);
      } else {
        all.push(resp.data);
      }
    }

    return all;
  }

  /**
   * Stats are time-series and need flattening of `metrics`
   */
  _timeSeriesFetch({ nodeName, accountId, fields, start_time, end_time }) {
    const uniqueKeys = this.fieldsSchema[nodeName].uniqueKeys || [];
    const missingKeys = uniqueKeys.filter(key => !fields.includes(key));
    
    if (missingKeys.length > 0) {
      throw new Error(`Missing required unique fields for endpoint '${nodeName}'. Missing fields: ${missingKeys.join(', ')}`);
    }

    // first get promoted tweet IDs
    const promos = this.fetchData({ nodeName: 'promoted_tweets', accountId, fields: ['id'] });
    const ids = promos.map(r => r.id);
    if (!ids.length) return [];

    // extend end_time by one day
    const e = new Date(end_time);
    e.setDate(e.getDate() + 1);
    const endStr = EnvironmentAdapter.formatDate(e, 'UTC', 'yyyy-MM-dd');

    const result = [];
    for (let i = 0; i < ids.length; i += this.config.StatsMaxEntityIds.value) {
      const batch = ids.slice(i, i + this.config.StatsMaxEntityIds.value).join(',');
      const common = {
        entity: 'PROMOTED_TWEET',
        entity_ids: batch,
        granularity: 'DAY',
        metric_groups: 'ENGAGEMENT,BILLING',
        start_time,
        end_time: endStr
      };

      for (const placement of ['ALL_ON_TWITTER','PUBLISHER_NETWORK']) {
        const raw = this._rawFetch(`stats/accounts/${accountId}`, { ...common, placement });
        const arr = Array.isArray(raw.data) ? raw.data : [raw.data];

        arr.forEach(h => {
          const m = h.id_data?.[0]?.metrics || {};
          const flat = {
            id: h.id,
            date: start_time,
            placement,
            impressions: m.impressions?.[0] || 0,
            tweets_send: m.tweets_send?.[0] || 0,
            billed_charge_local_micro: m.billed_charge_local_micro?.[0] || 0,
            qualified_impressions: m.qualified_impressions?.[0] || 0,
            follows: m.follows?.[0] || 0,
            app_clicks: m.app_clicks?.[0] || 0,
            retweets: m.retweets?.[0] || 0,
            unfollows: m.unfollows?.[0] || 0,
            likes: m.likes?.[0] || 0,
            engagements: m.engagements?.[0] || 0,
            clicks: m.clicks?.[0] || 0,
            card_engagements: m.card_engagements?.[0] || 0,
            poll_card_vote: m.poll_card_vote?.[0] || 0,
            replies: m.replies?.[0] || 0,
            url_clicks: m.url_clicks?.[0] || 0,
            billed_engagements: m.billed_engagements?.[0] || 0,
            carousel_swipes: m.carousel_swipes?.[0] || 0
          };

          result.push(this._filterBySchema([flat], 'stats', fields)[0]);
        });
      }
    }

    return result;
  }

  /**
   * Pull JSON from the Ads API (raw, no field-filter).
   */
  _rawFetch(path, params = {}) {
    const url = `${this.config.BaseUrl.value}${this.config.Version.value}/${path}`;
    const qs = Object.keys(params).length
      ? '?' + Object.entries(params)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join('&')
      : '';
    const finalUrl = url + qs;

    const oauth = this._generateOAuthHeader({ method: 'GET', url, params });
    const resp  = UrlFetchApp.fetch(finalUrl, {
      method: 'GET',
      headers: { Authorization: oauth, 'Content-Type': 'application/json' },
      muteHttpExceptions: true
    });

    const code = resp.getResponseCode(), body = resp.getContentText();
    if (code < 200 || code >= 300) {
      throw new Error(`X Ads API error ${code}: ${body}`);
    }
    return JSON.parse(body);
  }

  _getData(path, nodeName, fields, extraParams = {}) {
    const json = this._rawFetch(path, extraParams);
    if (!json.data) return json;

    const arr  = Array.isArray(json.data) ? json.data : [json.data];
    const filtered = this._filterBySchema(arr, nodeName, fields);

    json.data = Array.isArray(json.data) ? filtered : filtered[0];
    return json;
  }

  /**
   * Keep only requestedFields plus any schema-required keys.
   * @param {Array<Object>} items
   * @param {string} nodeName
   * @param {Array<string>} requestedFields
   * @returns {Array<Object>}
   */
  _filterBySchema(items, nodeName, requestedFields = []) {
    const schema = this.fieldsSchema[nodeName];
    const requiredFields = new Set(schema.requiredFields || []);
    const keepFields = new Set([ ...requiredFields, ...requestedFields ]);

    return items.map(item => {
      const result = {};
      for (const key of Object.keys(item)) {
        if (keepFields.has(key)) {
          result[key] = item[key];
        }
      }
      return result;
    });
  }

  /**
   * Generate OAuth 1.0a header for requests
   * * TODO: Consider refactoring OAuth functionality:
   *   1. Move OAuth logic to a separate AbstractOAuthConnector class
   *   2. Split into smaller methods for better testability
   *   3. Create a separate OAuthUtils class for common OAuth operations
   */
  _generateOAuthHeader({ method, url, params = {} }) {
    const { ConsumerKey, ConsumerSecret, AccessToken, AccessTokenSecret } = this.config;
    const oauth = {
      oauth_consumer_key: ConsumerKey.value,
      oauth_nonce: EnvironmentAdapter.getUuid().replace(/-/g,''),
      oauth_signature_method:'HMAC-SHA1',
      oauth_timestamp: Math.floor(Date.now()/1000),
      oauth_token: AccessToken.value,
      oauth_version: '1.0'
    };
    const sigParams = { ...oauth, ...params };
    const baseString= [
      method.toUpperCase(),
      encodeURIComponent(url),
      encodeURIComponent(
        Object.keys(sigParams).sort()
          .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(sigParams[k])}`)
          .join('&')
      )
    ].join('&');
    const signingKey = encodeURIComponent(ConsumerSecret.value) + '&' + encodeURIComponent(AccessTokenSecret.value);
    oauth.oauth_signature = EnvironmentAdapter.base64Encode(
      EnvironmentAdapter.computeHmacSignature(
        EnvironmentAdapter.MacAlgorithm.HMAC_SHA_1,
        baseString,
        signingKey
      )
    );
    return 'OAuth ' + Object.keys(oauth)
      .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauth[k])}"`)
      .join(', ');
  }

  /**
   * Clear tweet/promoted-tweet caches.
   * */
  clearTweetsCache(accountId) {
    this._tweetsCache.delete(accountId);
    this._promotedTweetsCache.delete(accountId);
  }
};
