/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { AbstractSource } from '../../Core/AbstractSource.js';

export class LinkedInAdsSource extends AbstractSource {
  constructor(context) {
    super(context);

    this.parameters = {
      AuthType: {
        requiredType: 'object',
        label: 'Auth Type',
        description: 'Authentication type',
        isRequired: true,
        oneOf: [
          {
            label: 'OAuth2',
            value: 'oauth2',
            requiredType: 'object',
            attributes: [CONFIG_ATTRIBUTES.OAUTH_FLOW],
            oauthParams: {
              vars: {
                ClientId: {
                  type: 'string',
                  required: true,
                  store: 'env',
                  key: 'OAUTH_LINKEDIN_ADS_CLIENT_ID',
                  attributes: [
                    OAUTH_CONSTANTS.UI,
                    OAUTH_CONSTANTS.SECRET,
                    OAUTH_CONSTANTS.REQUIRED,
                  ],
                },
                ClientSecret: {
                  type: 'string',
                  required: true,
                  store: 'env',
                  key: 'OAUTH_LINKEDIN_ADS_CLIENT_SECRET',
                  attributes: [OAUTH_CONSTANTS.SECRET, OAUTH_CONSTANTS.REQUIRED],
                },
                RedirectUri: {
                  type: 'string',
                  required: true,
                  store: 'env',
                  key: 'OAUTH_LINKEDIN_ADS_REDIRECT_URI',
                  attributes: [OAUTH_CONSTANTS.UI, OAUTH_CONSTANTS.REQUIRED],
                },
                Scopes: {
                  type: 'string',
                  store: 'env',
                  key: 'OAUTH_LINKEDIN_ADS_SCOPE',
                  default: 'r_ads,r_ads_reporting',
                  attributes: [OAUTH_CONSTANTS.UI],
                },
              },
              mapping: {
                RefreshToken: {
                  type: 'string',
                  required: true,
                  store: 'secret',
                  key: 'refresh_token',
                },
                ClientId: {
                  type: 'string',
                  required: true,
                  store: 'secret',
                  key: 'client_id',
                },
                ClientSecret: {
                  type: 'string',
                  required: true,
                  store: 'secret',
                  key: 'client_secret',
                },
                AccessToken: {
                  type: 'string',
                  required: false,
                  store: 'secret',
                  key: 'access_token',
                },
              },
            },
            items: {
              ClientId: {
                isRequired: true,
                requiredType: 'string',
                label: 'Client ID',
                description: 'LinkedIn API Client ID for authentication',
              },
              ClientSecret: {
                isRequired: true,
                requiredType: 'string',
                label: 'Primary Client Secret',
                description: 'LinkedIn API Primary Client Secret for authentication',
                attributes: [CONFIG_ATTRIBUTES.SECRET],
              },
              RefreshToken: {
                isRequired: true,
                requiredType: 'string',
                label: 'Refresh Token',
                description: 'LinkedIn API Refresh Token for authentication',
                attributes: [CONFIG_ATTRIBUTES.SECRET],
              },
              AccessToken: {
                requiredType: 'string',
                label: 'Access Token',
                description: 'LinkedIn API Access Token (auto-generated)',
                attributes: [CONFIG_ATTRIBUTES.SECRET],
              },
            },
          },
        ],
      },
      ClientID: {
        isRequired: false,
        requiredType: 'string',
        label: 'Client ID',
        description: 'LinkedIn API Client ID for authentication',
        attributes: [CONFIG_ATTRIBUTES.DEPRECATED, CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM],
      },
      ClientSecret: {
        isRequired: false,
        requiredType: 'string',
        label: 'Primary Client Secret',
        description: 'LinkedIn API Primary Client Secret for authentication',
        attributes: [
          CONFIG_ATTRIBUTES.SECRET,
          CONFIG_ATTRIBUTES.DEPRECATED,
          CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM,
        ],
      },
      RefreshToken: {
        isRequired: false,
        requiredType: 'string',
        label: 'Refresh Token',
        description: 'LinkedIn API Refresh Token for authentication',
        attributes: [
          CONFIG_ATTRIBUTES.SECRET,
          CONFIG_ATTRIBUTES.DEPRECATED,
          CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM,
        ],
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
      Fields: {
        isRequired: true,
        label: 'Fields',
        description: 'List of fields to fetch from LinkedIn API',
      },
      AccountURNs: {
        isRequired: true,
        label: 'Account URNs',
        description: 'LinkedIn Ads Account URNs to fetch data from',
      },
      CreateEmptyTables: {
        requiredType: 'boolean',
        default: true,
        label: 'Create Empty Tables',
        description: 'Create tables with all columns even if no data is returned from API',
        attributes: [CONFIG_ATTRIBUTES.ADVANCED],
      },
    };

    this._registerParameters();

    this.fieldsSchema = LinkedInAdsFieldsSchema;
    this.MAX_FIELDS_PER_REQUEST = 20;
    // adAnalytics has no pagination and caps every response at this many elements, so a
    // response that reaches it was silently cut short rather than being all there is.
    this.MAX_RESPONSE_ELEMENTS = 15000;
    this.MAX_TRUNCATED_DAYS_IN_WARNING = 10;
    // Account id -> node -> the days whose response reached MAX_RESPONSE_ELEMENTS, reported
    // once per account: every WARN line becomes one of the run's warnings.
    this.truncatedAnalyticsDays = new Map();
    // Location names asked of adTargetingEntities in one request; LinkedIn documents no limit,
    // this keeps the URL well short of one.
    this.GEO_NAMES_PER_REQUEST = 50;
    // Geo URN -> name for the whole run: every day and campaign repeats the same locations.
    this.geoNames = new Map();
    // LinkedIn refused the lookup (401/403), so no batch is asked again this run.
    this.geoNamesUnavailable = false;
    // LinkedIn rejected a batch (another 4xx); said once per run.
    this.geoNamesRejected = false;
    // Account id -> what the geo breakdowns could not fill: locations LinkedIn gave no name
    // and rows that came without a location or a date. Reported once per account.
    this.geoGaps = new Map();
    this.MAX_GEO_URNS_IN_WARNING = 5;
    this.BASE_URL = 'https://api.linkedin.com/rest/';
  }

  /**
   * Day by day, not RANGE, and the difference is data loss rather than pacing.
   *
   * The adAnalytics endpoint does not paginate: it answers with at most
   * MAX_RESPONSE_ELEMENTS rows and says nothing about the ones it dropped. A whole
   * window in one request therefore returns a silently truncated slice of a busy
   * account, and the run reports success on incomplete data. One request per day keeps
   * each response far below the cap, and the engine's per-day checkpoint makes an
   * interrupted range resumable instead of restarting it.
   *
   * The geo breakdowns share the cap and ask once per campaign, so a day keeps them small
   * too. Only the analytics nodes are isTimeSeries, so only they consult this; the catalog
   * nodes are planned as plain nodes and never see a date.
   */
  getDateStrategy(nodeName) {
    return DATE_STRATEGY.DAY_BY_DAY;
  }

  /**
   * Retry transient LinkedIn failures: rate limits (429), server errors (5xx) and
   * network-level errors (no status code). Auth errors (401/403) are permanent for the
   * run and are not retried.
   *
   * Without this the AbstractSource default refuses every retry, so a single 429 during
   * a long backfill failed the whole run.
   *
   * @param {HttpRequestException} error - The error to check
   * @returns {boolean} True if the request should be retried
   */
  isValidToRetry(error) {
    return (
      !error?.statusCode ||
      error.statusCode >= HTTP_STATUS.SERVER_ERROR_MIN ||
      error.statusCode === HTTP_STATUS.TOO_MANY_REQUESTS
    );
  }

  getAccounts(context) {
    const urnsParam = context.getParameter('AccountURNs');
    if (!urnsParam?.value) return [null];
    return FormatUtils.parseIds(urnsParam.value, { prefix: 'urn:li:sponsoredAccount:' }).map(
      id => ({ id })
    );
  }

  async exchangeOauthCredentials(credentials, variables) {
    try {
      const tokenUrl = 'https://www.linkedin.com/oauth/v2/accessToken';
      const payload = {
        grant_type: 'authorization_code',
        code: credentials.code,
        client_id: variables.ClientId,
        client_secret: variables.ClientSecret,
        redirect_uri: variables.RedirectUri,
      };

      const options = {
        method: 'post',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: Object.entries(payload)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join('&'),
      };

      const response = await fetch(tokenUrl, options);
      const data = await response.json();

      if (data.error || !data.refresh_token) {
        throw new OauthFlowException({
          message:
            data.error_description ||
            data.error ||
            'Failed to exchange LinkedIn authorization code',
          payload: data,
        });
      }

      const expiresIn = data.expires_in ?? 3600;

      return OauthCredentialsDto.builder()
        .withUser({ id: 'unknown', name: 'LinkedIn Ads User' })
        .withSecret({
          refresh_token: data.refresh_token,
          access_token: data.access_token,
          client_id: variables.ClientId,
          client_secret: variables.ClientSecret,
        })
        .withExpiresIn(expiresIn)
        .build()
        .toObject();
    } catch (error) {
      if (error instanceof OauthFlowException) {
        throw error;
      }
      throw new OauthFlowException({
        message: 'Failed to exchange LinkedIn Ads authorization code',
        payload: error.message,
      });
    }
  }

  _getOAuthConfig() {
    const authTypeParam = this.context.getParameter('AuthType');
    const isOAuth2 = authTypeParam?.value === 'oauth2';
    return isOAuth2 ? authTypeParam.items || {} : {};
  }

  _getClientId() {
    const oauthConfig = this._getOAuthConfig();
    return (
      oauthConfig.ClientId?.value ||
      this.context.getParameter('ClientID')?.value ||
      process.env.OAUTH_LINKEDIN_ADS_CLIENT_ID
    );
  }

  _getClientSecret() {
    const oauthConfig = this._getOAuthConfig();
    return (
      oauthConfig.ClientSecret?.value ||
      this.context.getParameter('ClientSecret')?.value ||
      process.env.OAUTH_LINKEDIN_ADS_CLIENT_SECRET
    );
  }

  _getRefreshToken() {
    const oauthConfig = this._getOAuthConfig();
    return oauthConfig.RefreshToken?.value || this.context.getParameter('RefreshToken')?.value;
  }

  /**
   * Main entry point for fetching data from LinkedIn Ads API.
   * AbstractConnector calls us per (account × node × date-range).
   * accountId is the numeric ad account ID.
   */
  async fetchData({ nodeName, fields = [], accountId, startDate, endDate }) {
    const urn = accountId;
    const uniqueKeys = this.fieldsSchema[nodeName]?.uniqueKeys || [];
    const missingKeys = uniqueKeys.filter(key => !fields.includes(key));

    if (missingKeys.length > 0) {
      throw new Error(
        `Missing required unique fields for endpoint '${nodeName}'. Missing fields: ${missingKeys.join(', ')}`
      );
    }

    switch (nodeName) {
      case 'adAccounts':
        return await this.fetchSingleResource({ urn, resourceType: 'adAccounts', fields });
      case 'adCampaignGroups':
        return await this.fetchAdResource({ urn, resourceType: 'adCampaignGroups', fields });
      case 'adCampaigns':
        return await this.fetchAdResource({ urn, resourceType: 'adCampaigns', fields });
      case 'creatives':
        return await this.fetchAdResource({
          urn,
          resourceType: 'creatives',
          fields,
          queryType: 'criteria',
        });
      case 'adAnalytics':
        return await this.fetchAdAnalytics({ urn, fields, startDate, endDate });
      default:
        if (this.fieldsSchema[nodeName]?.geoPivot) {
          return await this.fetchAdAnalyticsByGeo({ nodeName, urn, fields, startDate, endDate });
        }
        throw new Error(`Unknown node: ${nodeName}`);
    }
  }

  /**
   * Fetch a single resource by URN
   */
  async fetchSingleResource({ urn, resourceType, fields }) {
    let url = `${this.BASE_URL}${resourceType}/${encodeURIComponent(urn)}`;
    url += `?fields=${this.formatFields(fields)}`;

    const result = await this.makeRequest(url);
    return [result];
  }

  /**
   * Fetch a collection of resources for an account
   */
  async fetchAdResource({ urn, resourceType, fields, queryType = 'search' }) {
    let url = `${this.BASE_URL}adAccounts/${encodeURIComponent(urn)}/${resourceType}?q=${queryType}&pageSize=100`;
    url += `&fields=${this.formatFields(fields)}`;

    return await this.fetchWithPagination(url);
  }

  /**
   * Fetch analytics data, handling field limits and data merging
   */
  async fetchAdAnalytics({ urn, fields, startDate, endDate }) {
    const accountUrn = `urn:li:sponsoredAccount:${urn}`;
    // LinkedIn API caps fields per request — split and merge.
    const fieldChunks = this.prepareAnalyticsFieldChunks(this.convertFieldsForApi(fields || []));

    const rows = await this.fetchAnalyticsRows({
      urn,
      nodeName: 'adAnalytics',
      pivots: ['CREATIVE', 'CAMPAIGN', 'CAMPAIGN_GROUP', 'ACCOUNT'],
      facet: `accounts=List(${encodeURIComponent(accountUrn)})`,
      start: new Date(startDate),
      end: new Date(endDate),
      fieldChunks,
    });

    return this.transformAnalyticsDateRanges(rows);
  }

  /**
   * One adAnalytics read: a request per field chunk, merged into one row per dateRange and
   * pivotValues.
   *
   * getDateStrategy keeps every read to one day, which puts the element cap far out of reach
   * for an ordinary account -- so reaching it is worth saying out loud rather than counting,
   * and the day is recorded for the account's warning. The rows already fetched are still
   * returned: they are real, there are simply more of them than LinkedIn would hand over.
   *
   * @returns {Promise<object[]>} merged elements, with dateRange still in LinkedIn's shape
   */
  async fetchAnalyticsRows({ urn, nodeName, pivots, facet, start, end, fieldChunks, timeGranularity }) {
    let rows = [];

    for (const fields of fieldChunks) {
      const url = this.buildAdAnalyticsUrl({
        pivots,
        facet,
        startDate: start,
        endDate: end,
        fields,
        timeGranularity,
      });
      const res = await this.makeRequest(url);
      const elements = res.elements || [];

      if (elements.length >= this.MAX_RESPONSE_ELEMENTS) {
        this.recordTruncatedDay(urn, nodeName, start);
      }

      rows = this.mergeAnalyticsResults(rows, elements);
    }

    return rows;
  }

  recordTruncatedDay(urn, nodeName, start) {
    if (!this.truncatedAnalyticsDays.has(urn)) this.truncatedAnalyticsDays.set(urn, new Map());
    const byNode = this.truncatedAnalyticsDays.get(urn);
    const days = byNode.get(nodeName) ?? [];
    const day = start.toISOString().slice(0, 10);
    if (!days.includes(day)) days.push(day);
    byNode.set(nodeName, days);
  }

  /**
   * One geo breakdown (country, region or county) of a day's analytics, per campaign.
   *
   * LinkedIn returns a member pivot such as MEMBER_COUNTRY_V2 only from the analytics
   * finder, which takes that one pivot and nothing else. Rows can therefore only carry the
   * campaign when each request is narrowed to one campaign. To ask only for campaigns that
   * ran, the day's campaigns are read first.
   *
   * pivotValues holds the location URN; it becomes the node's location column, and its
   * name is looked up through adTargetingEntities. A row without a location or a date is
   * left out: both are part of the unique key, and a key with an empty part never matches
   * on reimport, so the row would be stored again on every run.
   */
  async fetchAdAnalyticsByGeo({ nodeName, urn, fields, startDate, endDate }) {
    const { geoPivot, geoField } = this.fieldsSchema[nodeName];
    const geoNameField = `${geoField}Name`;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const accountUrn = `urn:li:sponsoredAccount:${urn}`;

    // The account, campaign and location columns are filled here, not asked of LinkedIn.
    const filledHere = ['account', 'campaign', geoField, geoNameField];
    const apiFields = this.convertFieldsForApi(fields.filter(field => !filledHere.includes(field)));
    const fieldChunks = this.prepareAnalyticsFieldChunks(apiFields);

    const campaignUrns = await this.fetchActiveCampaignUrns({
      urn,
      nodeName,
      start,
      end,
      fieldChunks,
    });
    const rows = [];

    for (const campaignUrn of campaignUrns) {
      const campaignRows = await this.fetchAnalyticsRows({
        urn,
        nodeName,
        pivots: [geoPivot],
        facet: `campaigns=List(${encodeURIComponent(campaignUrn)})`,
        start,
        end,
        fieldChunks,
      });
      for (const row of campaignRows) {
        rows.push({ ...row, account: accountUrn, campaign: campaignUrn });
      }
    }

    const complete = rows.filter(
      row => row.pivotValues?.[0] && row.dateRange?.start && row.dateRange?.end
    );
    const gaps = this.geoGapsOf(urn);
    gaps.incompleteRows += rows.length - complete.length;

    const names = await this.resolveGeoNames(complete.map(row => row.pivotValues[0]));

    return this.transformAnalyticsDateRanges(complete).map(row => {
      const { pivotValues, ...rest } = row;
      const geoUrn = pivotValues[0];
      const name = names.get(geoUrn) ?? null;
      // A refused lookup is reported once for the run; only the names missing otherwise are
      // listed for the account.
      if (name === null && !this.geoNamesUnavailable) gaps.unnamed.add(geoUrn);
      return { ...rest, [geoField]: geoUrn, [geoNameField]: name };
    });
  }

  geoGapsOf(urn) {
    if (!this.geoGaps.has(urn)) this.geoGaps.set(urn, { unnamed: new Set(), incompleteRows: 0 });
    return this.geoGaps.get(urn);
  }

  /**
   * The campaigns of an account that have analytics in the range, as URNs.
   *
   * Asked with the same metrics as the breakdown, so a campaign is listed whenever any
   * metric the node imports has activity in the range, not only when it had impressions:
   * conversions can land on a day a campaign showed no ads.
   */
  async fetchActiveCampaignUrns({ urn, nodeName, start, end, fieldChunks }) {
    const rows = await this.fetchAnalyticsRows({
      urn,
      nodeName,
      pivots: ['CAMPAIGN'],
      facet: `accounts=List(${encodeURIComponent(`urn:li:sponsoredAccount:${urn}`)})`,
      start,
      end,
      fieldChunks,
      timeGranularity: 'ALL',
    });

    return [...new Set(rows.map(row => row.pivotValues?.[0]).filter(Boolean))];
  }

  /**
   * Names for geo URNs, from LinkedIn's URN-to-name resolver (adTargetingEntities, q=urns).
   *
   * Each URN is asked once per run. A URN LinkedIn does not name stays empty rather than
   * being asked again; fetchAdAnalyticsByGeo lists it in the account's warning.
   *
   * - A failure LinkedIn may get over (rate limit, server or network error) outlasting the
   *   retries fails the day, so its rows are not stored without names and the next run asks
   *   again.
   * - Not being allowed (401/403) will not change within the run: no batch is asked again,
   *   the metrics and location URNs still load with names left empty, and one warning says
   *   so.
   * - Any other 4xx rejects only what that batch asked: its locations stay unnamed and are
   *   listed in the account's warning, and the next batches are still asked.
   *
   * @param {string[]} geoUrns - location URNs such as urn:li:geo:103644278
   * @returns {Promise<Map<string, string|null>>} URN -> name, for every URN resolved so far
   */
  async resolveGeoNames(geoUrns) {
    if (this.geoNamesUnavailable) return this.geoNames;

    const unknown = [...new Set(geoUrns)].filter(geoUrn => !this.geoNames.has(geoUrn));

    for (let i = 0; i < unknown.length; i += this.GEO_NAMES_PER_REQUEST) {
      const batch = unknown.slice(i, i + this.GEO_NAMES_PER_REQUEST);
      let elements = [];

      try {
        elements = await this.fetchGeoNameElements(batch);
      } catch (error) {
        if (this.isValidToRetry(error)) throw error;
        if (this._isAuthError(error)) {
          this.geoNamesUnavailable = true;
          this.context.log(
            LOG_LEVEL.WARN,
            `LinkedIn refused the location name lookup (${error.message}); location names ` +
              'are left empty, and the location URNs and metrics are imported'
          );
          return this.geoNames;
        }
        if (!this.geoNamesRejected) {
          this.geoNamesRejected = true;
          this.context.log(
            LOG_LEVEL.WARN,
            `LinkedIn rejected a location name lookup (${error.message}); the locations it ` +
              'asked for are left unnamed'
          );
        }
      }

      // An empty name is no name: it is stored and reported as missing.
      for (const element of elements) {
        if (element?.urn) this.geoNames.set(element.urn, element.name || null);
      }
      for (const geoUrn of batch) {
        if (!this.geoNames.has(geoUrn)) this.geoNames.set(geoUrn, null);
      }
    }

    return this.geoNames;
  }

  /**
   * The adTargetingEntities elements for one batch of URNs. LinkedIn's documented answer to
   * q=urns comes in one page; should it come in several, the next pages are read too, so a
   * URN on a later page is not taken for one LinkedIn has no name for.
   */
  async fetchGeoNameElements(geoUrns) {
    const url =
      `${this.BASE_URL}adTargetingEntities?q=urns&queryVersion=QUERY_USES_URNS` +
      `&urns=List(${this.formatFields(geoUrns)})` +
      `&locale=(language:en,country:US)`;
    const elements = [];
    let pageUrl = url;

    // Every page read holds at least one element, so there are never more pages than URNs.
    for (let page = 0; pageUrl && page < geoUrns.length; page++) {
      const res = await this.makeRequest(pageUrl);
      const pageElements = res.elements || [];
      for (const element of pageElements) elements.push(element);

      const hasNext = res.paging?.links?.some(link => link.rel === 'next');
      pageUrl =
        hasNext && pageElements.length > 0
          ? `${url}&start=${(res.paging.start ?? 0) + pageElements.length}`
          : null;
    }

    return elements;
  }

  /**
   * Reports, once per account, the days a response was cut short and what the geo
   * breakdowns could not fill, instead of a warning per day: every WARN line becomes one of
   * the run's warnings.
   */
  onAccountComplete(account) {
    this.reportAccountWarnings(account);
  }

  /**
   * The engine calls onAccountComplete only for an account that finished without an issue,
   * so what an account gathered before a failure is reported here: a run that fails after
   * importing days with empty names still says so. The days after a failure are asked again
   * by the next run, which reports them then.
   */
  onAccountError(account) {
    this.reportAccountWarnings(account);
  }

  reportAccountWarnings(account) {
    this.reportTruncatedDays(account);
    this.reportGeoGaps(account);
  }

  reportTruncatedDays(account) {
    const byNode = this.truncatedAnalyticsDays.get(account?.id);
    if (!byNode) return;
    this.truncatedAnalyticsDays.delete(account.id);

    for (const [nodeName, days] of byNode) {
      this.context.log(
        LOG_LEVEL.WARN,
        `${nodeName} responses for account ${account.id} reached LinkedIn's ` +
          `${this.MAX_RESPONSE_ELEMENTS}-element limit on ${days.length} day(s): ` +
          `${this.listSome(days, this.MAX_TRUNCATED_DAYS_IN_WARNING)}; ` +
          'data for those days may be incomplete'
      );
    }
  }

  reportGeoGaps(account) {
    const gaps = this.geoGaps.get(account?.id);
    if (!gaps) return;
    this.geoGaps.delete(account.id);

    if (gaps.unnamed.size > 0) {
      this.context.log(
        LOG_LEVEL.WARN,
        `LinkedIn returned no name for ${gaps.unnamed.size} location(s) of account ` +
          `${account.id}: ${this.listSome([...gaps.unnamed], this.MAX_GEO_URNS_IN_WARNING)}; ` +
          'their name column is left empty'
      );
    }
    if (gaps.incompleteRows > 0) {
      this.context.log(
        LOG_LEVEL.WARN,
        `LinkedIn returned ${gaps.incompleteRows} row(s) without a location or a date for ` +
          `account ${account.id}; they were not imported`
      );
    }
  }

  /** "a, b, c and 2 more": the first `max` items, and how many were left out. */
  listSome(items, max) {
    const hidden = items.length - max;
    return `${items.slice(0, max).join(', ')}${hidden > 0 ? ` and ${hidden} more` : ''}`;
  }

  convertFieldsForApi(fields) {
    const apiFields = fields.map(field => {
      if (field === 'dateRangeStart' || field === 'dateRangeEnd') {
        return 'dateRange';
      }
      return field;
    });
    return [...new Set(apiFields)];
  }

  prepareAnalyticsFieldChunks(fields) {
    const requiredFields = ['dateRange', 'pivotValues'];
    const uniqueFields = [...new Set(fields)].filter(field => !requiredFields.includes(field));

    const maxCustomFieldsPerChunk = this.MAX_FIELDS_PER_REQUEST - requiredFields.length;
    const fieldChunks = [];

    for (let i = 0; i < uniqueFields.length; i += maxCustomFieldsPerChunk) {
      const customFields = uniqueFields.slice(i, i + maxCustomFieldsPerChunk);
      fieldChunks.push([...requiredFields, ...customFields]);
    }

    if (fieldChunks.length === 0) {
      fieldChunks.push([...requiredFields]);
    }

    return fieldChunks;
  }

  /**
   * An adAnalytics request. Several pivots go to the statistics finder; a single pivot goes
   * to the analytics finder, the only one that accepts a member pivot such as
   * MEMBER_COUNTRY_V2.
   *
   * @param {{pivots: string[], facet: string, startDate: Date, endDate: Date,
   *   fields: string[], timeGranularity?: string}} request - facet is the encoded filter,
   *   such as `accounts=List(urn%3Ali%3AsponsoredAccount%3A1)`
   * @returns {string} the request URL, without the access token
   */
  buildAdAnalyticsUrl({ pivots, facet, startDate, endDate, fields, timeGranularity = 'DAILY' }) {
    const [finder, pivotParam] =
      pivots.length > 1
        ? ['statistics', `pivots=List(${pivots.join(',')})`]
        : ['analytics', `pivot=${pivots[0]}`];

    return (
      `${this.BASE_URL}adAnalytics?q=${finder}` +
      `&dateRange=(start:${this.formatDateForUrl(startDate)},` +
      `end:${this.formatDateForUrl(endDate)})` +
      `&${pivotParam}` +
      `&timeGranularity=${timeGranularity}` +
      `&${facet}` +
      `&fields=${this.formatFields(fields)}`
    );
  }

  /**
   * Splits a Date into the year/month/day parts LinkedIn wants.
   *
   * Reads the UTC parts, not the local ones. A run date arrives here as UTC midnight, and
   * the engine checkpoints and logs it through the UTC formatter — so on a runner west of
   * UTC the local getters name the PREVIOUS day, and the request, the log and the cursor
   * stop agreeing about which day was imported.
   */
  toLinkedInDateObject(date) {
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
  }

  formatDateForUrl(date) {
    const { year, month, day } = this.toLinkedInDateObject(date);
    return `(year:${year},month:${month},day:${day})`;
  }

  formatFields(fields) {
    return fields.map(field => encodeURIComponent(field)).join(',');
  }

  mergeAnalyticsResults(existingResults, newElements) {
    // dateRange and pivotValues identify a row; the same row from another field chunk is combined.
    const keyOf = element => JSON.stringify([element.dateRange, element.pivotValues]);
    const mergedByKey = new Map(existingResults.map(element => [keyOf(element), element]));

    for (const newElement of newElements) {
      const key = keyOf(newElement);
      mergedByKey.set(key, { ...mergedByKey.get(key), ...newElement });
    }

    return [...mergedByKey.values()];
  }

  transformAnalyticsDateRanges(analyticsData) {
    if (!analyticsData || !analyticsData.length) {
      return analyticsData;
    }

    return analyticsData.map(item => {
      const res = { ...item };

      if (res.dateRange?.start) {
        res.dateRangeStart = this.formatDateFromLinkedInObject(res.dateRange.start);
      }

      if (res.dateRange?.end) {
        res.dateRangeEnd = this.formatDateFromLinkedInObject(res.dateRange.end);
      }

      delete res.dateRange;
      return res;
    });
  }

  formatDateFromLinkedInObject(dateObj) {
    const { year, month, day } = dateObj;
    const pad = n => String(n).padStart(2, '0');
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  /**
   * Exchanges the refresh token for an access token, once per run.
   *
   * Cached because the exchange used to happen on every single request, and fetching
   * adAnalytics a day at a time turns a 90-day backfill into 90+ requests per account —
   * each one paying for a token LinkedIn had already issued, and each one a chance to hit
   * the token endpoint's own rate limit.
   *
   * @param {{clientId: string, clientSecret: string, refreshToken: string}} credentials
   * @returns {Promise<string>} the access token for this run
   */
  async getAccessToken({ clientId, clientSecret, refreshToken }) {
    if (this._accessToken) return this._accessToken;

    this._accessToken = await OAuthUtils.getAccessToken({
      context: this.context,
      tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
      formData: {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      },
    });

    return this._accessToken;
  }

  /**
   * Make a request to LinkedIn API with proper headers and auth
   */
  async makeRequest(url) {
    this.context.log(LOG_LEVEL.INFO, `LinkedIn Ads API Request URL: ${url}`);
    const clientId = this._getClientId();
    const clientSecret = this._getClientSecret();
    const refreshToken = this._getRefreshToken();

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error('LinkedIn Ads OAuth credentials are not configured');
    }

    const accessToken = await this.getAccessToken({ clientId, clientSecret, refreshToken });

    const headers = {
      'LinkedIn-Version': '202609',
      'X-RestLi-Protocol-Version': '2.0.0',
    };

    const authUrl = `${url}${url.includes('?') ? '&' : '?'}oauth2_access_token=${accessToken}`;

    const response = await this.urlFetchWithRetry(authUrl, { headers });
    const text = await response.text();
    return JSON.parse(text);
  }

  /**
   * Fetch resources with pagination support
   */
  async fetchWithPagination(baseUrl) {
    let allResults = [];
    let pageToken = null;

    do {
      let pageUrl = baseUrl;
      if (pageToken) {
        pageUrl += `${pageUrl.includes('?') ? '&' : '?'}pageToken=${encodeURIComponent(pageToken)}`;
      }

      const res = await this.makeRequest(pageUrl);
      const elements = res.elements || [];
      allResults = allResults.concat(elements);

      const metadata = res.metadata || {};
      pageToken = metadata.nextPageToken || null;
    } while (pageToken !== null);

    return allResults;
  }
}
