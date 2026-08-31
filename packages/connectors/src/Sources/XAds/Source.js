/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { AbstractSource } from '../../Core/AbstractSource.js';

const zlib = require('zlib');

const PLACEMENTS = ['ALL_ON_TWITTER', 'PUBLISHER_NETWORK'];

export class XAdsSource extends AbstractSource {
  constructor(context) {
    super(context);

    this.parameters = {
      ConsumerKey: {
        isRequired: true,
        requiredType: 'string',
        label: 'Consumer Key',
        description: 'Your X Ads API Consumer Key',
        attributes: [CONFIG_ATTRIBUTES.SECRET],
      },
      ConsumerSecret: {
        isRequired: true,
        requiredType: 'string',
        label: 'Consumer Secret',
        description: 'Your X Ads API Consumer Secret',
        attributes: [CONFIG_ATTRIBUTES.SECRET],
      },
      AccessToken: {
        isRequired: true,
        requiredType: 'string',
        label: 'Access Token',
        description: 'Your X Ads API Access Token',
        attributes: [CONFIG_ATTRIBUTES.SECRET],
      },
      AccessTokenSecret: {
        isRequired: true,
        requiredType: 'string',
        label: 'Access Token Secret',
        description: 'Your X Ads API Access Token Secret',
        attributes: [CONFIG_ATTRIBUTES.SECRET],
      },
      AccountIDs: {
        isRequired: true,
        requiredType: 'string',
        label: 'Account ID',
        description: 'Your X Ads Account ID',
      },
      Fields: {
        isRequired: true,
        label: 'Fields',
        description: 'List of fields to fetch from X Ads API',
      },
      StartDate: {
        requiredType: 'date',
        label: 'Start Date',
        description: 'Start date for data import',
        attributes: [CONFIG_ATTRIBUTES.MANUAL_BACKFILL, CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM],
      },
      EndDate: {
        requiredType: 'date',
        label: 'End Date',
        description: 'End date for data import',
        attributes: [CONFIG_ATTRIBUTES.MANUAL_BACKFILL, CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM],
      },
      ReimportLookbackWindow: {
        requiredType: 'number',
        isRequired: true,
        default: 2,
        label: 'Reimport Lookback Window',
        description: 'Number of days to look back when reimporting data',
        attributes: [CONFIG_ATTRIBUTES.ADVANCED],
      },
      CleanUpToKeepWindow: {
        requiredType: 'number',
        label: 'Clean Up To Keep Window',
        description: 'Number of days to keep data before cleaning up',
        attributes: [CONFIG_ATTRIBUTES.ADVANCED],
      },
      Version: {
        requiredType: 'string',
        default: '12',
        label: 'API Version',
        description: 'X Ads API version',
        attributes: [CONFIG_ATTRIBUTES.ADVANCED],
      },
      DataMaxCount: {
        requiredType: 'number',
        default: 1000,
        label: 'Max Data Count',
        description: 'Maximum number of records to fetch per request',
        attributes: [CONFIG_ATTRIBUTES.ADVANCED],
      },
      CardsMaxCountPerRequest: {
        requiredType: 'number',
        default: 20,
        label: 'Max Cards Per Request',
        description: 'Maximum number of cards to fetch per request',
        attributes: [CONFIG_ATTRIBUTES.ADVANCED],
      },
      AdsApiDelay: {
        requiredType: 'number',
        default: 3.65,
        label: 'API Delay (seconds)',
        description: 'Delay between API requests in seconds',
        attributes: [CONFIG_ATTRIBUTES.ADVANCED],
      },
      StatsMaxEntityIds: {
        requiredType: 'number',
        default: 20,
        label: 'Max Stats Entity IDs',
        description: 'Maximum number of entity_ids allowed per request for stats endpoint',
        attributes: [CONFIG_ATTRIBUTES.ADVANCED],
      },
      CreateEmptyTables: {
        requiredType: 'boolean',
        default: true,
        label: 'Create Empty Tables',
        description: 'Create tables with all columns even if no data is returned from API',
        attributes: [CONFIG_ATTRIBUTES.ADVANCED],
      },
    };

    this.context.registerParameters(this.parameters, PARAMETER_OWNER.SOURCE);

    this.fieldsSchema = XAdsFieldsSchema;
    this._promotedTweetsCache = new Map(); // Map<accountId, Array>
    this.BASE_URL = 'https://ads-api.x.com/';
  }

  /**
   * X Ads stats endpoints accept a date range natively for sync stats,
   * but the legacy connector fetched day-by-day to keep cursor state aligned
   * across re-runs. Preserve that.
   */
  getDateStrategy(nodeName) {
    return DATE_STRATEGY.DAY_BY_DAY;
  }

  /**
   * Parse comma/semicolon-separated AccountIDs into [{ id }, ...].
   */
  getAccounts(context) {
    const accountIdsParam = context.getParameter('AccountIDs');
    if (!accountIdsParam?.value) return [null];
    return XAdsHelper.parseAccountIds(accountIdsParam.value)
      .filter(Boolean)
      .map(id => ({ id }));
  }

  /**
   * Parse "node1 fieldA, node1 fieldB, ..." → { node1: ['fieldA','fieldB'] }.
   */
  parseFields(context) {
    const fieldsValue = context.getParameter('Fields')?.value;
    if (!fieldsValue) return {};
    return XAdsHelper.parseFields(fieldsValue);
  }

  /**
   * After all nodes for an account are processed, drop its promoted_tweets
   * cache to free memory (legacy XAdsConnector did this explicitly).
   */
  onAccountComplete(account) {
    if (account?.id) {
      this.clearCache(account.id);
    }
  }

  /**
   * Single fetch entry point. AbstractConnector calls us with
   * { nodeName, fields, accountId, startDate, endDate } once per
   * (account × node × day) under 'day-by-day' (the default).
   *
   * NOTE on async stats nodes: legacy code chunked dates into 15-day blocks
   * and streamed per-day results through an onBatchReady callback. Under the
   * new architecture each day is its own fetchData() call, so the chunking
   * disappears naturally — submit/poll/download runs for a single date and
   * returns its rows. The cursor advances after each saveData() in the
   * AbstractConnector loop, preserving the "if day N fails, days 1..(N-1) are
   * already persisted" guarantee from the legacy implementation.
   */
  async fetchData({ nodeName, accountId, fields = [], startDate, endDate }) {
    const apiDelay = this.context.getParameter('AdsApiDelay')?.value;
    if (apiDelay) {
      await AsyncUtils.delay(apiDelay * 1000);
    }

    // Map Connector-supplied startDate/endDate (YYYY-MM-DD strings under day-by-day)
    // to the legacy start_time/end_time names used internally.
    const start_time = startDate;
    const end_time = endDate;

    const dataMaxCount = this.context.getParameter('DataMaxCount')?.value;
    const cardsMaxCount = this.context.getParameter('CardsMaxCountPerRequest')?.value;

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
          pageSize: dataMaxCount,
        });

      case 'cards':
        return await this._catalogFetch({
          nodeName,
          accountId,
          fields,
          pageSize: cardsMaxCount,
        });

      case 'cards_all':
        return await this._fetchAllCards(accountId, fields);

      case 'stats':
        return await this._timeSeriesFetch({ nodeName, accountId, fields, start_time, end_time });

      case 'stats_by_country':
        return await this._fetchAsyncStatsForDate({
          nodeName,
          accountId,
          fields,
          date: start_time,
        });

      case 'targeting_locations':
        return await this._fetchTargetingLocations(fields);

      default:
        throw new Error(`Unknown node: ${nodeName}`);
    }
  }

  /**
   * Shared logic for non-time-series endpoints.
   */
  async _catalogFetch({ nodeName, accountId, fields, pageSize }) {
    const uniqueKeys = this.fieldsSchema[nodeName].uniqueKeys || [];
    const missingKeys = uniqueKeys.filter(key => !fields.includes(key));

    if (missingKeys.length > 0) {
      throw new Error(
        `Missing required unique fields for endpoint '${nodeName}'. Missing fields: ${missingKeys.join(', ')}`
      );
    }

    if (nodeName === 'promoted_tweets' && this._promotedTweetsCache.has(accountId)) {
      return this._promotedTweetsCache.get(accountId);
    }

    let all = await this._fetchPages({
      accountId,
      nodeName,
      fields,
      extraParams:
        nodeName === 'tweets'
          ? { tweet_type: 'PUBLISHED', timeline_type: 'NULLCAST', trim_user: true }
          : {},
      pageSize,
    });

    if (nodeName === 'campaigns' && fields.includes('account_id')) {
      all = all.map(item => ({
        ...item,
        account_id: accountId,
      }));
    }

    if (nodeName === 'promoted_tweets') {
      this._promotedTweetsCache.set(accountId, all);
    }

    return all;
  }

  /**
   * Shared pagination logic.
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
        ...(cursor ? { cursor } : {}),
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
   * Fetch all cards by first collecting URIs from tweets, then calling
   * the cards/all endpoint in chunks.
   */
  async _fetchAllCards(accountId, fields) {
    const tweets = await this.fetchData({
      nodeName: 'tweets',
      accountId,
      fields: ['id', 'card_uri'],
    });
    const uris = tweets.map(t => t.card_uri).filter(Boolean);
    if (!uris.length) return [];

    const all = [];
    const chunkSize = this.context.getParameter('CardsMaxCountPerRequest')?.value;
    for (let i = 0; i < uris.length; i += chunkSize) {
      const chunk = uris.slice(i, i + chunkSize);
      const resp = await this._getData(`accounts/${accountId}/cards/all`, 'cards_all', fields, {
        card_uris: chunk.join(','),
        with_deleted: true,
      });
      if (Array.isArray(resp.data)) {
        all.push(...resp.data);
      } else {
        all.push(resp.data);
      }
    }

    return all;
  }

  /**
   * Stats are time-series and need flattening of `metrics`.
   */
  async _timeSeriesFetch({ nodeName, accountId, fields, start_time, end_time }) {
    const uniqueKeys = this.fieldsSchema[nodeName].uniqueKeys || [];
    const missingKeys = uniqueKeys.filter(key => !fields.includes(key));

    if (missingKeys.length > 0) {
      throw new Error(
        `Missing required unique fields for endpoint '${nodeName}'. Missing fields: ${missingKeys.join(', ')}`
      );
    }

    // First get promoted tweet IDs.
    const promos = await this.fetchData({ nodeName: 'promoted_tweets', accountId, fields: ['id'] });
    const ids = promos.map(r => r.id);
    if (!ids.length) return [];

    // Extend end_time by one day. Use UTC methods to avoid DST shifts.
    const e = new Date(end_time);
    e.setUTCDate(e.getUTCDate() + 1);
    const endStr = this._formatDate(e);

    const statsMaxEntityIds = this.context.getParameter('StatsMaxEntityIds')?.value;

    const result = [];
    for (let i = 0; i < ids.length; i += statsMaxEntityIds) {
      const batch = ids.slice(i, i + statsMaxEntityIds).join(',');
      const common = {
        entity: 'PROMOTED_TWEET',
        entity_ids: batch,
        granularity: 'DAY',
        metric_groups: 'ENGAGEMENT,BILLING',
        start_time,
        end_time: endStr,
      };

      for (const placement of PLACEMENTS) {
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
            carousel_swipes: m.carousel_swipes?.[0] || 0,
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
    const version = this.context.getParameter('Version')?.value;
    const url = `${this.BASE_URL}${version}/${path}`;
    const qs = Object.keys(params).length
      ? '?' +
        Object.entries(params)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join('&')
      : '';
    const finalUrl = url + qs;

    const oauth = this._generateOAuthHeader({ method: 'GET', url, params });

    await AsyncUtils.delay(1000);

    const resp = await this.urlFetchWithRetry(finalUrl, {
      method: 'GET',
      headers: { Authorization: oauth, 'Content-Type': 'application/json' },
      muteHttpExceptions: true,
    });

    const text = await resp.text();
    return JSON.parse(text);
  }

  async _rawPostFetch(path, params = {}) {
    const version = this.context.getParameter('Version')?.value;
    const url = `${this.BASE_URL}${version}/${path}`;

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
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      muteHttpExceptions: true,
    });

    const text = await resp.text();
    return JSON.parse(text);
  }

  async _submitAsyncStatsJob({
    accountId,
    entityIds,
    placement,
    start_time,
    end_time,
    segmentation_type = 'LOCATIONS',
  }) {
    const params = {
      entity: 'PROMOTED_TWEET',
      entity_ids: entityIds.join(','),
      placement,
      granularity: 'DAY',
      metric_groups: 'ENGAGEMENT,BILLING',
      segmentation_type,
      start_time,
      end_time,
    };

    const resp = await this._rawPostFetch(`stats/jobs/accounts/${accountId}`, params);

    if (resp.errors) {
      throw new Error(
        `X Ads API error when submitting async stats job: ${JSON.stringify(resp.errors)}`
      );
    }

    if (!resp.data?.id) {
      throw new Error(`Failed to submit async stats job: ${JSON.stringify(resp)}`);
    }

    return resp.data.id;
  }

  async _downloadAndParseJobResults({ nodeName, downloadUrl, placement, start_time }) {
    const resolvedUrl = this._extractDownloadUrl(downloadUrl);

    const headers = {};
    if (resolvedUrl.includes('ads-api.x.com')) {
      const urlObj = new URL(resolvedUrl);
      const oauth = this._generateOAuthHeader({
        method: 'GET',
        url: urlObj.origin + urlObj.pathname,
        params: {},
      });
      headers['Authorization'] = oauth;
    }

    const resp = await this.urlFetchWithRetry(resolvedUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(60000),
      muteHttpExceptions: true,
    });

    const statusCode = resp.status;
    if (statusCode < 200 || statusCode > 299) {
      const errorText = await resp.text();
      throw new Error(
        `CDN download failed (HTTP ${statusCode}) for job results at ${start_time}: ${errorText.substring(0, 500)}`
      );
    }

    const buffer = Buffer.from(await resp.arrayBuffer());
    const text = await new Promise((resolve, reject) =>
      zlib.gunzip(buffer, (err, result) => (err ? reject(err) : resolve(result.toString('utf8'))))
    );
    const json = JSON.parse(text);

    const { segmentField } = this.fieldsSchema[nodeName];
    const NON_METRIC_FIELDS = new Set(['id', 'date', 'placement', segmentField]);
    const metricFields = Object.keys(this.fieldsSchema[nodeName].fields).filter(
      k => !NON_METRIC_FIELDS.has(k)
    );

    const arr = Array.isArray(json.data) ? json.data : [json.data];
    const rawResult = [];

    for (const h of arr) {
      const segments = h.id_data || [];
      for (const segment of segments) {
        const segmentValue = segment.segment?.segment_value || null;
        const m = segment.metrics || {};
        const row = { id: h.id, date: start_time, placement, [segmentField]: segmentValue };
        for (const field of metricFields) {
          row[field] = m[field]?.[0] || 0;
        }
        rawResult.push(row);
      }
    }

    return rawResult;
  }

  /**
   * Returns the promoted tweet IDs for an account. Cached via _promotedTweetsCache.
   */
  async _getPromotedTweetIds(accountId) {
    const promos = await this.fetchData({ nodeName: 'promoted_tweets', accountId, fields: ['id'] });
    return promos.map(r => r.id);
  }

  /**
   * Submits, polls, and downloads async stats jobs for a single date.
   * Replaces the legacy multi-date dateChunk + onBatchReady streaming pattern;
   * AbstractConnector calls us once per date so the connector loop's saveData()
   * does the per-date persistence the old onBatchReady provided.
   * @private
   */
  async _fetchAsyncStatsForDate({ nodeName, accountId, fields, date }) {
    const { segmentationType } = this.fieldsSchema[nodeName];

    const uniqueKeys = this.fieldsSchema[nodeName].uniqueKeys || [];
    const missingKeys = uniqueKeys.filter(key => !fields.includes(key));
    if (missingKeys.length > 0) {
      throw new Error(
        `Missing required unique fields for '${nodeName}'. Missing: ${missingKeys.join(', ')}`
      );
    }

    const ids = await this._getPromotedTweetIds(accountId);
    if (!ids.length) return [];

    // The async stats API treats end_time as exclusive, so advance by one day.
    const e = new Date(date);
    e.setUTCDate(e.getUTCDate() + 1);
    const endStr = this._formatDate(e);

    const statsMaxEntityIds = this.context.getParameter('StatsMaxEntityIds')?.value;

    const dateRows = [];
    for (let i = 0; i < ids.length; i += statsMaxEntityIds) {
      const entityIds = ids.slice(i, i + statsMaxEntityIds);
      for (const placement of PLACEMENTS) {
        const jobId = await this._submitAsyncStatsJob({
          accountId,
          entityIds,
          placement,
          start_time: date,
          end_time: endStr,
          segmentation_type: segmentationType,
        });
        const downloadUrl = await this._pollUntilReady(accountId, jobId);
        const rows = await this._downloadAndParseJobResults({
          nodeName,
          downloadUrl,
          placement,
          start_time: date,
        });
        dateRows.push(...this._filterBySchema(rows, nodeName, fields));
      }
    }

    return dateRows;
  }

  /**
   * Polls a single async stats job until SUCCESS or FAILED.
   * Progressive backoff: 3s → 5s → 5s → 10s → 10s → 15s thereafter.
   */
  async _pollUntilReady(accountId, jobId) {
    const POLL_INTERVALS = [3000, 5000, 5000, 10000, 10000];
    const POLL_INTERVAL_DEFAULT = 15000;
    const MAX_POLL_ATTEMPTS = 180;

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await AsyncUtils.delay(POLL_INTERVALS[attempt] || POLL_INTERVAL_DEFAULT);

      const resp = await this._rawFetch(`stats/jobs/accounts/${accountId}`, { job_ids: jobId });
      const jobs = this._toDataArray(resp.data);

      if (!jobs.length) {
        continue;
      }

      const job = jobs[0];

      if (job.status === 'SUCCESS') {
        if (!job.url) throw new Error(`Job ${jobId} succeeded but url is null`);
        return job.url;
      }
      if (job.status === 'FAILED') {
        throw new Error(`Async stats job ${jobId} failed: ${JSON.stringify(job)}`);
      }
    }

    throw new Error(
      `Async stats job ${jobId} did not complete after ${MAX_POLL_ATTEMPTS} poll attempts`
    );
  }

  /**
   * Determines if a X Ads API error is valid for retry
   * Based on X Ads API error codes and HTTP status codes
   *
   * @param {HttpRequestException} error - The error to check
   * @return {boolean} True if the error should trigger a retry, false otherwise
   */
  isValidToRetry(error) {
    // One structured entry rather than raw console writes, which the backend
    // splits into a separate run-log entry per line
    this.context.log(LOG_LEVEL.INFO, `X Ads retry check: statusCode=${error.statusCode}`);
    if (error.statusCode && error.statusCode >= HTTP_STATUS.SERVER_ERROR_MIN) {
      return true;
    }
    if (error.statusCode === HTTP_STATUS.TOO_MANY_REQUESTS) {
      return true;
    }
    if (!error.statusCode) {
      return true;
    }
    return false;
  }

  async _getData(path, nodeName, fields, extraParams = {}) {
    const json = await this._rawFetch(path, extraParams);
    if (!json.data) return json;

    const arr = Array.isArray(json.data) ? json.data : [json.data];
    const filtered = this._filterBySchema(arr, nodeName, fields);

    json.data = Array.isArray(json.data) ? filtered : filtered[0];
    return json;
  }

  /**
   * Keep only requestedFields plus any schema-required keys.
   */
  _filterBySchema(items, nodeName, requestedFields = []) {
    const schema = this.fieldsSchema[nodeName];
    const requiredFields = new Set(schema.requiredFields || []);
    const keepFields = new Set([...requiredFields, ...requestedFields]);

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
   */
  async _fetchTargetingLocations(fields) {
    const all = [];
    let cursor = null;
    const MAX_PAGES = 20;
    let page = 0;

    while (page < MAX_PAGES) {
      page++;
      const params = { location_type: 'COUNTRIES', count: 1000 };
      if (cursor) params.cursor = cursor;

      const resp = await this._rawFetch('targeting_criteria/locations', params);
      const arr = this._toDataArray(resp.data);

      for (const loc of arr) {
        all.push({
          targeting_value: loc.targeting_value || null,
          name: loc.name || null,
          location_type: loc.location_type || null,
          country_code: loc.country_code || null,
        });
      }

      cursor = resp.next_cursor || null;
      if (!cursor) break;
    }

    return this._filterBySchema(all, 'targeting_locations', fields);
  }

  /**
   * Extracts the actual download URL from a potentially malformed URL string.
   */
  _extractDownloadUrl(url) {
    const parts = url.split('https://').filter(Boolean);
    if (parts.length <= 1) return url;
    return 'https://' + parts[parts.length - 1];
  }

  /**
   * Normalises an API response value to an array.
   */
  _toDataArray(data) {
    return Array.isArray(data) ? data : data ? [data] : [];
  }

  /**
   * Format a Date as YYYY-MM-DD (UTC).
   * @private
   */
  _formatDate(date) {
    return date.toISOString().split('T')[0];
  }

  /**
   * Generate OAuth 1.0a header for requests.
   */
  _generateOAuthHeader({ method, url, params = {} }) {
    const consumerKey = this.context.getParameter('ConsumerKey')?.value;
    const consumerSecret = this.context.getParameter('ConsumerSecret')?.value;
    const accessToken = this.context.getParameter('AccessToken')?.value;
    const accessTokenSecret = this.context.getParameter('AccessTokenSecret')?.value;

    const oauth = {
      oauth_consumer_key: consumerKey,
      oauth_nonce: CryptoUtils.getUuid().replace(/-/g, ''),
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: Math.floor(Date.now() / 1000),
      oauth_token: accessToken,
      oauth_version: '1.0',
    };
    const sigParams = { ...oauth, ...params };
    const baseString = [
      method.toUpperCase(),
      encodeURIComponent(url),
      encodeURIComponent(
        Object.keys(sigParams)
          .sort()
          .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(sigParams[k])}`)
          .join('&')
      ),
    ].join('&');
    const signingKey =
      encodeURIComponent(consumerSecret) + '&' + encodeURIComponent(accessTokenSecret);
    oauth.oauth_signature = CryptoUtils.base64Encode(
      CryptoUtils.computeHmacSignature(CryptoUtils.MacAlgorithm.HMAC_SHA_1, baseString, signingKey)
    );
    return (
      'OAuth ' +
      Object.keys(oauth)
        .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauth[k])}"`)
        .join(', ')
    );
  }

  /**
   * Clear cache for a specific account. Called by onAccountComplete().
   */
  clearCache(accountId) {
    this._promotedTweetsCache.delete(accountId);
  }
}
