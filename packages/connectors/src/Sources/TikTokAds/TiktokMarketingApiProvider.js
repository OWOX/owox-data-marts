/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

class TiktokMarketingApiProvider {
  constructor(appId, accessToken, appSecret, isSandbox = false) {
    // Constants
    this.BASE_URL = "https://business-api.tiktok.com/open_api/";
    this.SANDBOX_BASE_URL = "https://sandbox-ads.tiktok.com/open_api/";
    this.API_VERSION = "v1.3";
    this.MAX_STRING_LENGTH = 50000;
    this.MAX_RETRIES = 3;
    this.INITIAL_BACKOFF = 1000;
    this.SUCCESS_CODE = 0;
    this.RATE_LIMIT_CODE = 40100;
    this.SUCCESS_RESPONSE_CODE = 200;

    this.appId = appId;
    this.accessToken = accessToken;
    this.appSecret = appSecret;
    this.isSandbox = isSandbox;
    this.currentAdvertiserId = null;
  }

  getBaseUrl() {
    return this.isSandbox ? this.SANDBOX_BASE_URL : this.BASE_URL;
  }

  getApiVersion() {
    return this.API_VERSION;
  }

  async makeRequest(options) {
    const { url, method, data } = options;
    const headers = {
      'Access-Token': this.accessToken,
      'Content-Type': 'application/json'
    };

    let backoff = this.INITIAL_BACKOFF;

    for (let retries = 0; retries < this.MAX_RETRIES; retries++) {
      try {
        const response = HttpUtils.fetch(url, {
          method: method,
          headers: headers,
          body: data ? JSON.stringify(data) : null,
          muteHttpExceptions: true
        });

        const responseCode = response.getResponseCode();
        const text = await response.getContentText();
        
        if (responseCode !== this.SUCCESS_RESPONSE_CODE) {
          throw new Error(`TikTok API error: ${text}`);
        }

        const jsonData = JSON.parse(text);

        if (jsonData.code !== this.SUCCESS_CODE) {
          if (jsonData.code === this.RATE_LIMIT_CODE) {
            console.error("TikTok Marketing API rate limit exceeded. Retrying...");
            await AsyncUtils.delay(backoff);
            backoff *= 2;
            continue;
          }
          throw new Error(`TikTok API error: ${jsonData.message}`);
        }

        return jsonData;
      } catch (error) {
        if (retries < this.MAX_RETRIES - 1 && error.message.includes('rate limit')) {
          await AsyncUtils.delay(backoff);
          backoff *= 2;
        } else {
          throw error;
        }
      }
    }
  }

  async handlePagination(endpoint, params = {}) {
    let allData = [];
    let page = 1;
    let hasMorePages = true;
    const pageSize = 100;

    while (hasMorePages) {
      const paginatedParams = { ...params, page, page_size: pageSize };
      const url = this.buildUrl(endpoint, paginatedParams);
      const response = await this.makeRequest({ url, method: 'GET' });

      const pageData = response.data.list || [];
      allData = allData.concat(pageData);

      const total = response.data.page_info ? response.data.page_info.total_number : 0;
      const currentCount = page * pageSize;
      hasMorePages = (currentCount < total && pageData.length > 0);
      page++;

      if (hasMorePages) {
        await AsyncUtils.delay(100);
      }
    }

    return allData;
  }

  buildUrl(endpoint, params = {}) {
    let url = `${this.getBaseUrl()}${this.getApiVersion()}/${endpoint}`;
    const queryParams = [];

    for (const [key, value] of Object.entries(params)) {
      if (value !== null && value !== undefined) {
        if (typeof value === 'object') {
          queryParams.push(`${key}=${encodeURIComponent(JSON.stringify(value))}`);
        } else {
          queryParams.push(`${key}=${encodeURIComponent(value)}`);
        }
      }
    }

    if (queryParams.length > 0) {
      url += '?' + queryParams.join('&');
    }

    return url;
  }

  getValidAdInsightsMetrics() {
    return [
      // Cost metrics
      "spend", "cpc", "cpm", "cpr", "cpa", "cost_per_conversion", "cost_per_1000_reached",
      
      // Performance metrics
      "impressions", "clicks", "ctr", "reach", "frequency", "viewable_impression", 
      "viewable_rate", "video_play_actions", "video_watched_2s", "video_watched_6s",
      "average_video_play", "average_video_play_per_user", "video_views_p25", 
      "video_views_p50", "video_views_p75", "video_views_p100", "profile_visits",
      "profile_visits_rate", "likes", "comments", "shares", "follows", "landing_page_views",
      
      // Conversion metrics
      "conversion", "cost_per_conversion", "conversion_rate", "conversion_1d_click", 
      "conversion_7d_click", "conversion_28d_click"
    ];
  }

  getAdvertisers(advertiserIds) {
    if (!this.appId || !this.appSecret) {
      throw new Error("To fetch advertiser data, both AppId and AppSecret must be provided.");
    }

    const params = {
      advertiser_ids: advertiserIds,
      app_id: this.appId,
      secret: this.appSecret
    };

    const url = this.buildUrl('oauth2/advertiser/get/', params);
    const response = this.makeRequest({ url, method: 'GET' });
    return response.data.list;
  }

  getCampaigns(advertiserId, fields = [], filtering = null) {
    this.currentAdvertiserId = advertiserId;
    const params = {
      advertiser_id: advertiserId,
      fields: fields,
      filtering: filtering
    };

    return this.handlePagination('campaign/get/', params);
  }
  
  getAdGroups(advertiserId, fields = [], filtering = null) {
    this.currentAdvertiserId = advertiserId;
    const params = {
      advertiser_id: advertiserId,
      fields: fields,
      filtering: filtering
    };

    return this.handlePagination('adgroup/get/', params);
  }
  
  getAds(advertiserId, fields = [], filtering = null) {
    this.currentAdvertiserId = advertiserId;
    const params = {
      advertiser_id: advertiserId,
      fields: fields,
      filtering: filtering
    };

    return this.handlePagination('ad/get/', params);
  }
  
  getAdInsights(options) {
    const { advertiserId, dataLevel, dimensions, metrics, startDate, endDate } = options;
    this.currentAdvertiserId = advertiserId;
    const params = {
      advertiser_id: advertiserId,
      report_type: 'BASIC',
      dimensions: dimensions,
      metrics: metrics,
      data_level: dataLevel,
      start_date: startDate,
      end_date: endDate
    };

    return this.handlePagination('report/integrated/get/', params);
  }
  
  getAudiences(advertiserId) {
    this.currentAdvertiserId = advertiserId;
    const params = {
      advertiser_id: advertiserId
    };

    return this.handlePagination('dmp/custom_audience/list/', params);
  }
}
