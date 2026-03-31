/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

const zlib = require('zlib');

const PLACEMENTS = ['ALL_ON_TWITTER', 'PUBLISHER_NETWORK'];

var XAdsSource = class XAdsSource extends AbstractSource {
  constructor(config) {
    super(config.mergeParameters({
      ConsumerKey: {
        isRequired: true,
        requiredType: "string",
        label: "Consumer Key (API Key)",
        description: "Your X Ads API Consumer Key",
        attributes: [CONFIG_ATTRIBUTES.SECRET]
      },
      ConsumerSecret: {
        isRequired: true,
        requiredType: "string",
        label: "Consumer Secret (API Secret)",
        description: "Your X Ads API Consumer Secret",
        attributes: [CONFIG_ATTRIBUTES.SECRET]
      },
      AccessToken: {
        isRequired: true,
        requiredType: "string",
        label: "Access Token",
        description: "Your X Ads API Access Token",
        attributes: [CONFIG_ATTRIBUTES.SECRET]
      },
      AccessTokenSecret: {
        isRequired: true,
        requiredType: "string",
        label: "Access Token Secret",
        description: "Your X Ads API Access Token Secret",
        attributes: [CONFIG_ATTRIBUTES.SECRET]
      },
      AccountIDs: {
        isRequired: true,
        requiredType: "string",
        label: "Account ID",
        description: "Your X Ads Account ID"
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
      ReimportLookbackWindow: {
        requiredType: "number",
        isRequired: true,
        default: 2,
        label: "Reimport Lookback Window",
        description: "Number of days to look back when reimporting data",
        attributes: [CONFIG_ATTRIBUTES.ADVANCED]
      },
      CleanUpToKeepWindow: {
        requiredType: "number",
        label: "Clean Up To Keep Window",
        description: "Number of days to keep data before cleaning up",
        attributes: [CONFIG_ATTRIBUTES.ADVANCED]
      },
      Version: {
        requiredType: "string",
        default: "12",
        label: "API Version",
        description: "X Ads API version",
        attributes: [CONFIG_ATTRIBUTES.ADVANCED]
      },
      DataMaxCount: {
        requiredType: "number",
        default: 1000,
        label: "Max Data Count",
        description: "Maximum number of records to fetch per request",
        attributes: [CONFIG_ATTRIBUTES.ADVANCED]
      },
      CardsMaxCountPerRequest: {
        requiredType: "number",
        default: 20,
        label: "Max Cards Per Request",
        description: "Maximum number of cards to fetch per request",
        attributes: [CONFIG_ATTRIBUTES.ADVANCED]
      },
      AdsApiDelay: {
        requiredType: "number",
        default: 3.65,
        label: "API Delay (seconds)",
        description: "Delay between API requests in seconds",
        attributes: [CONFIG_ATTRIBUTES.ADVANCED]
      },
      StatsMaxEntityIds: {
        requiredType: "number",
        default: 20,
        label: "Max Stats Entity IDs",
        description: "Maximum number of entity_ids allowed per request for stats endpoint",
        attributes: [CONFIG_ATTRIBUTES.ADVANCED]
      },
      CreateEmptyTables: {
        requiredType: "boolean",
        default: true,
        label: "Create Empty Tables",
        description: "Create tables with all columns even if no data is returned from API",
        attributes: [CONFIG_ATTRIBUTES.ADVANCED]
      }
    }));

    this.fieldsSchema = XAdsFieldsSchema;
    this._promotedTweetsCache = new Map(); // Map<accountId, Array>
    this.BASE_URL = "https://ads-api.x.com/"; // Base URL for X Ads API
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
  async fetchData({ nodeName, accountId, fields = [], start_time, end_time }) {
    await AsyncUtils.delay(this.config.AdsApiDelay.value * 1000);

    switch (nodeName) {
      case 'accounts': {
        const resp = await this._getData(`accounts/${accountId}`, 'accounts', fields);
        return [resp.data];
      }
      case 'campaigns':
      case 'line_items':
      case 'promoted_tweets':
      case 'tweets':
        return await this._catalogFetch({
          nodeName,
          accountId,
          fields,
          pageSize: this.config.DataMaxCount.value
        });

      case 'cards':
        return await this._catalogFetch({
          nodeName,
          accountId,
          fields,
          pageSize: this.config.CardsMaxCountPerRequest.value
        });

      case 'cards_all':
        return await this._fetchAllCards(accountId, fields);

      case 'stats':
        return await this._timeSeriesFetch({ nodeName, accountId, fields, start_time, end_time });

      case 'stats_by_country':
        return await this._timeSeriesAsyncFetch({ nodeName, accountId, fields, start_time, end_time });

      case 'targeting_locations':
        return await this._fetchTargetingLocations(fields);

      default:
        throw new Error(`Unknown node: ${nodeName}`);
    }
  }

  /**
   * Shared logic for non-time-series endpoints
   */
  async _catalogFetch({ nodeName, accountId, fields, pageSize }) {
    const uniqueKeys = this.fieldsSchema[nodeName].uniqueKeys || [];
    const missingKeys = uniqueKeys.filter(key => !fields.includes(key));

    if (missingKeys.length > 0) {
      throw new Error(`Missing required unique fields for endpoint '${nodeName}'. Missing fields: ${missingKeys.join(', ')}`);
    }

    // Check cache for promoted_tweets (used internally by stats for each day)
    if (nodeName === 'promoted_tweets' && this._promotedTweetsCache.has(accountId)) {
      console.log(`Using cached promoted_tweets for account ${accountId}`);
      return this._promotedTweetsCache.get(accountId);
    }

    let all = await this._fetchPages({
      accountId,
      nodeName,
      fields,
      extraParams: nodeName === 'tweets'
        ? { tweet_type: 'PUBLISHED', timeline_type: 'NULLCAST', trim_user: true }
        : {},
      pageSize
    });

    if (nodeName === 'campaigns' && fields.includes('account_id')) {
      all = all.map(item => ({
        ...item,
        account_id: accountId
      }));
    }

    if (nodeName === 'promoted_tweets') {
      console.log(`Fetched promoted_tweets from API for account ${accountId}`);
      this._promotedTweetsCache.set(accountId, all);
    }

    return all;
  }

  /**
   * Shared pagination logic
   */
  async _fetchPages({ accountId, nodeName, fields, extraParams = {}, pageSize }) {
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

      const resp = await this._getData(
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
  async _fetchAllCards(accountId, fields) {
    const tweets = await this.fetchData({ nodeName: 'tweets', accountId, fields: ['id', 'card_uri'] });
    const uris   = tweets.map(t => t.card_uri).filter(Boolean);
    if (!uris.length) return [];

    const all = [];
    const chunkSize = this.config.CardsMaxCountPerRequest.value;
    for (let i = 0; i < uris.length; i += chunkSize) {
      const chunk = uris.slice(i, i + chunkSize);
      const resp  = await this._getData(
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
  async _timeSeriesFetch({ nodeName, accountId, fields, start_time, end_time }) {
    const uniqueKeys = this.fieldsSchema[nodeName].uniqueKeys || [];
    const missingKeys = uniqueKeys.filter(key => !fields.includes(key));

    if (missingKeys.length > 0) {
      throw new Error(`Missing required unique fields for endpoint '${nodeName}'. Missing fields: ${missingKeys.join(', ')}`);
    }

    // first get promoted tweet IDs
    const promos = await this.fetchData({ nodeName: 'promoted_tweets', accountId, fields: ['id'] });
    const ids = promos.map(r => r.id);
    if (!ids.length) return [];

    // extend end_time by one day
    const e = new Date(end_time);
    e.setDate(e.getDate() + 1);
    const endStr = DateUtils.formatDate(e);

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
        const raw = await this._rawFetch(`stats/accounts/${accountId}`, { ...common, placement });
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
  async _rawFetch(path, params = {}) {
    const url = `${this.BASE_URL}${this.config.Version.value}/${path}`;
    const qs = Object.keys(params).length
      ? '?' + Object.entries(params)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join('&')
      : '';
    const finalUrl = url + qs;

    const oauth = this._generateOAuthHeader({ method: 'GET', url, params });

    await AsyncUtils.delay(1000);

    const resp = await this.urlFetchWithRetry(finalUrl, {
      method: 'GET',
      headers: { Authorization: oauth, 'Content-Type': 'application/json' },
      muteHttpExceptions: true
    });

    const text = await resp.getContentText();
    return JSON.parse(text);
  }

  /** 
   * Added methods for async operations needed for get the country data 
   */
  async _rawPostFetch(path, params = {}) {
    const url = `${this.BASE_URL}${this.config.Version.value}/${path}`;

    // X Ads API requires POST bodies as application/x-www-form-urlencoded, not JSON.
    const body = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    // OAuth 1.0a requires body params in the signature base string for POST requests.
    const oauth = this._generateOAuthHeader({ method: 'POST', url, params });

    await AsyncUtils.delay(1000);

    const resp = await this.urlFetchWithRetry(url, {
      method: 'POST',
      headers: {
        Authorization: oauth,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body,
      muteHttpExceptions: true
    });

    const text = await resp.getContentText();
    return JSON.parse(text);
  }

  async _submitAsyncStatsJob({ accountId, entityIds, placement, start_time, end_time }) {
    const params = {
      entity: 'PROMOTED_TWEET',
      entity_ids: entityIds.join(','),
      placement,
      granularity: 'DAY',
      metric_groups: 'ENGAGEMENT,BILLING',
      segmentation_type: 'LOCATIONS',
      start_time,
      end_time
    };

    const resp = await this._rawPostFetch(`stats/jobs/accounts/${accountId}`, params);

    if (!resp.data?.id) {
      throw new Error(`Failed to submit async stats job: ${JSON.stringify(resp)}`);
    }

    return resp.data.id;
  }

  async _downloadAndParseJobResults({ downloadUrl, placement, start_time }) {
    // No OAuth header — downloadUrl is a pre-signed CDN URL served as raw gzip binary
    // (no Content-Encoding header), so we decompress manually with zlib.
    // 60s timeout guards against a stalled CDN connection hanging the import indefinitely.
    const resp = await HttpUtils.fetch(downloadUrl, { signal: AbortSignal.timeout(60000) });
    const buffer = await resp.getBlob();
    const text = await new Promise((resolve, reject) =>
      zlib.gunzip(buffer, (err, result) => err ? reject(err) : resolve(result.toString('utf8')))
    );
    const json = JSON.parse(text);

    const arr = Array.isArray(json.data) ? json.data : [json.data];
    const rawResult = [];

    for (const h of arr) {
      const segments = h.id_data || [];
      for (const segment of segments) {
        const country = segment.segment?.segment_value || null;
        const m = segment.metrics || {};
        rawResult.push({
          id:                         h.id,
          date:                       start_time,
          placement,
          country,
          impressions:                m.impressions?.[0]                || 0,
          tweets_send:                m.tweets_send?.[0]                || 0,
          billed_charge_local_micro:  m.billed_charge_local_micro?.[0]  || 0,
          qualified_impressions:      m.qualified_impressions?.[0]      || 0,
          follows:                    m.follows?.[0]                    || 0,
          app_clicks:                 m.app_clicks?.[0]                 || 0,
          retweets:                   m.retweets?.[0]                   || 0,
          unfollows:                  m.unfollows?.[0]                  || 0,
          likes:                      m.likes?.[0]                      || 0,
          engagements:                m.engagements?.[0]                || 0,
          clicks:                     m.clicks?.[0]                     || 0,
          card_engagements:           m.card_engagements?.[0]           || 0,
          poll_card_vote:             m.poll_card_vote?.[0]             || 0,
          replies:                    m.replies?.[0]                    || 0,
          url_clicks:                 m.url_clicks?.[0]                 || 0,
          billed_engagements:         m.billed_engagements?.[0]         || 0,
          carousel_swipes:            m.carousel_swipes?.[0]            || 0,
        });
      }
    }

    return rawResult;
  }

  /**
   * Fetch country-segmented async stats for a single day.
   * Called once per day by processTimeSeriesNode (same pattern as Microsoft Ads).
   *
   * Flow (fully sequential — ODM supports only one loading stream):
   *   1. Submit one async job per (entityBatch × placement).
   *   2. Poll all submitted jobs in a single API call every 10 s until all succeed.
   *   3. Download and parse each result file one at a time.
   *
   * @returns {Array<Object>} Flat array of filtered rows for the given day.
   */
  async _timeSeriesAsyncFetch({ nodeName, accountId, fields, start_time, end_time }) {
    const uniqueKeys = this.fieldsSchema[nodeName].uniqueKeys || [];
    const missingKeys = uniqueKeys.filter(key => !fields.includes(key));
    if (missingKeys.length > 0) {
      throw new Error(`Missing required unique fields for '${nodeName}'. Missing: ${missingKeys.join(', ')}`);
    }

    const promos = await this.fetchData({ nodeName: 'promoted_tweets', accountId, fields: ['id'] });
    const ids = promos.map(r => r.id);
    if (!ids.length) return [];

    // The async stats API treats end_time as exclusive, so advance by one day
    // to include the full target date in the result set.
    const e = new Date(end_time);
    e.setDate(e.getDate() + 1);
    const endStr = DateUtils.formatDate(e);

    // Phase 1: Submit all jobs for this day sequentially.
    // _rawPostFetch has a built-in 1 s delay, so submissions are naturally spaced.
    const pendingJobs = []; // { placement, jobId }
    for (let i = 0; i < ids.length; i += this.config.StatsMaxEntityIds.value) {
      const entityIds = ids.slice(i, i + this.config.StatsMaxEntityIds.value);
      for (const placement of PLACEMENTS) {
        const jobId = await this._submitAsyncStatsJob({ accountId, entityIds, placement, start_time, end_time: endStr });
        pendingJobs.push({ placement, jobId });
      }
    }

    // Phase 2: Poll all jobs in a single API request per interval.
    // GET /stats/jobs/accounts/:id accepts comma-separated job_ids, so we check
    // every pending job in one round-trip instead of polling each individually.
    // 30-minute timeout (180 × 10 s), matching the Microsoft Ads connector.
    // X Ads jobs can take longer under server load (e.g. after a 503 retry).
    const MAX_POLL_ATTEMPTS = 180;
    const POLL_INTERVAL_MS = 10000;
    const downloadUrls = new Map(); // jobId → pre-signed CDN URL
    let pendingIds = pendingJobs.map(j => j.jobId);

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS && pendingIds.length > 0; attempt++) {
      await AsyncUtils.delay(POLL_INTERVAL_MS);

      const resp = await this._rawFetch(`stats/jobs/accounts/${accountId}`, { job_ids: pendingIds.join(',') });
      const jobs = this._toDataArray(resp.data);

      const stillPending = [];
      for (const job of jobs) {
        if (job.status === 'SUCCESS') {
          if (!job.url) throw new Error(`Job ${job.id} succeeded but url is null`);
          downloadUrls.set(job.id, job.url);
        } else if (job.status === 'FAILED') {
          throw new Error(`Async stats job ${job.id} failed: ${JSON.stringify(job)}`);
        } else {
          stillPending.push(job.id);
        }
      }
      pendingIds = stillPending;
    }

    if (pendingIds.length > 0) {
      throw new Error(`${pendingIds.length} async job(s) did not complete after ${MAX_POLL_ATTEMPTS} poll attempts`);
    }

    // Phase 3: Download and parse each result file sequentially.
    const result = [];
    for (const { placement, jobId } of pendingJobs) {
      const rows = await this._downloadAndParseJobResults({
        downloadUrl: downloadUrls.get(jobId),
        placement,
        start_time
      });
      result.push(...rows);
    }

    return this._filterBySchema(result, nodeName, fields);
  }

  /**
   * Determines if a X Ads API error is valid for retry
   * Based on X Ads API error codes and HTTP status codes
   * 
   * @param {HttpRequestException} error - The error to check
   * @return {boolean} True if the error should trigger a retry, false otherwise
   */
  isValidToRetry(error) {
    console.log(`isValidToRetry() called`);
    console.log(`error.statusCode = ${error.statusCode}`);

    // Retry on server errors (5xx)
    if (error.statusCode && error.statusCode >= HTTP_STATUS.SERVER_ERROR_MIN) {
      return true;
    }

    // Retry on rate limits (429)
    if (error.statusCode === HTTP_STATUS.TOO_MANY_REQUESTS) {
      return true;
    }

    // Retry on network errors or timeouts
    if (!error.statusCode) {
      return true;
    }

    return false;
  }

  async _getData(path, nodeName, fields, extraParams = {}) {
    const json = await this._rawFetch(path, extraParams);
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
   * Fetch all country-level locations from the X Ads targeting API.
   * Returns a reference/lookup table mapping targeting_value (hex ID) to
   * human-readable name and country code. Intended to be run once and stored
   * as a guide table so users can JOIN stats_by_country.country → targeting_value.
   *
   * @param {Array<string>} fields - Fields to return per the schema
   * @returns {Promise<Array<Object>>}
   */
  async _fetchTargetingLocations(fields) {
    const all = [];
    let cursor = null;
    // X Ads returns ~250 countries in 1–2 pages (count=1000). Fetching other
    // location_types (REGIONS, CITIES, POSTAL_CODES) would require thousands of
    // pages and is impractical for a reference table — COUNTRIES is sufficient
    // for joining with stats_by_country.country.
    // MAX_PAGES is a safety cap against unexpected API pagination behaviour.
    const MAX_PAGES = 20;

    for (let page = 0; page < MAX_PAGES; page++) {
      const params = { location_type: 'COUNTRIES', count: 1000 };
      if (cursor) params.cursor = cursor;

      const resp = await this._rawFetch('targeting_criteria/locations', params);
      const arr = this._toDataArray(resp.data);

      for (const loc of arr) {
        all.push({
          targeting_value: loc.targeting_value || null,
          name: loc.name || null,
          location_type: loc.location_type || null,
          country_code: loc.country_code || null
        });
      }

      cursor = resp.next_cursor || null;
      if (!cursor) break;
    }

    console.log(`Fetched ${all.length} targeting locations`);
    return this._filterBySchema(all, 'targeting_locations', fields);
  }

  /**
   * Normalises an API response value to an array.
   * Handles three cases: already an array, a single object, or null/undefined.
   * Used when the API may return a single item or a list depending on the result count.
   */
  _toDataArray(data) {
    return Array.isArray(data) ? data : (data ? [data] : []);
  }

  /**
   * Generate OAuth 1.0a header for requests
   * * TODO: Consider refactoring OAuth functionality:
   *   1. Move OAuth logic to a separate AbstractOAuthSource class
   *   2. Split into smaller methods for better testability
   *   3. Create a separate OAuthUtils class for common OAuth operations
   */
  _generateOAuthHeader({ method, url, params = {} }) {
    const { ConsumerKey, ConsumerSecret, AccessToken, AccessTokenSecret } = this.config;
    const oauth = {
      oauth_consumer_key: ConsumerKey.value,
      oauth_nonce: CryptoUtils.getUuid().replace(/-/g,''),
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
    oauth.oauth_signature = CryptoUtils.base64Encode(
      CryptoUtils.computeHmacSignature(
        CryptoUtils.MacAlgorithm.HMAC_SHA_1,
        baseString,
        signingKey
      )
    );
    return 'OAuth ' + Object.keys(oauth)
      .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauth[k])}"`)
      .join(', ');
  }

  /**
   * Clear cache for a specific account
   * Called after processing all nodes for an account to free up memory
   */
  clearCache(accountId) {
    this._promotedTweetsCache.delete(accountId);
  }
};
