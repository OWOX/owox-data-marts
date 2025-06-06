/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var LinkedInSource = class LinkedInSource extends AbstractSource {
  constructor(config) {
    super(config.mergeParameters({
      AccessToken: {
        isRequired: true,
        requiredType: "string"
      },
      ApiType: {
        requiredType: "number",
        default: LinkedInApiTypes.ADS
      },
      Version: {
        requiredType: "string",
        default: "202504"
      },
      ReimportLookbackWindow: {
        requiredType: "number",
        isRequired: true,
        default: 2
      },
      CleanUpToKeepWindow: {
        requiredType: "number"
      },
      MaxFetchingDays: {
        requiredType: "number",
        isRequired: true,
        default: 31
      },
      BaseUrl: {
        requiredType: "string",
        default: "https://api.linkedin.com/rest/"
      },
      StartDate: {
        requiredType: "date",
        default: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      },
      Fields: {
        isRequired: true
      },
      MaxFieldsPerRequest: {
        requiredType: "number",
        isRequired: true,
        default: 20
      }
    }));
    
    if (this.config.AccountURNs) {
      this.apiType = LinkedInApiTypes.ADS;
      this.fieldsSchema = LinkedInAdsFieldsSchema;
      this.config = this.config.mergeParameters({
        AccountURNs: {
          isRequired: true
        }
      });
    } else if (this.config.OrganizationURNs) {
      this.apiType = LinkedInApiTypes.PAGES;
      this.fieldsSchema = LinkedInPagesFieldsSchema;
      this.config = this.config.mergeParameters({
        OrganizationURNs: {
          isRequired: true
        }
      });
    } else {
      throw new Error("Not supported API type.");
    }
  }
  
  /**
   * Main entry point for fetching data from LinkedIn API
   * @param {string} nodeName - Type of resource to fetch (e.g., adAccounts, adCampaigns)
   * @param {string} urn - Resource identifier
   * @param {Object} params - Additional parameters for the request
   * @returns {Array} - Array of fetched data objects
   */
  fetchData(nodeName, urn, params = {}) {
    const fields = params.fields || [];
    const uniqueKeys = this.fieldsSchema[nodeName]?.uniqueKeys || [];
    const missingKeys = uniqueKeys.filter(key => !fields.includes(key));
    
    if (missingKeys.length > 0) {
      throw new Error(`Missing required unique fields for endpoint '${nodeName}'. Missing fields: ${missingKeys.join(', ')}`);
    }
    
    switch (this.apiType) {
      case LinkedInApiTypes.ADS:
        return this.fetchAdsData(nodeName, urn, params);
      case LinkedInApiTypes.PAGES:
        return this.fetchPagesData(nodeName, urn, params);
      default:
        throw new Error(`API type ${this.apiType} is not supported`);
    }
  }
  
  /**
   * LinkedIn Ads API implementation of fetchData
   * @param {string} nodeName - Type of resource to fetch (e.g., adAccounts, adCampaigns)
   * @param {string} urn - Resource identifier
   * @param {Object} params - Additional parameters for the request
   * @returns {Array} - Array of fetched data objects
   */
  fetchAdsData(nodeName, urn, params = {}) {
    switch (nodeName) {
      case "adAccounts":
        return this.fetchSingleResource({ urn, resourceType: 'adAccounts', params });
      case "adCampaignGroups":
        return this.fetchAdResource({ urn, resourceType: 'adCampaignGroups', params });
      case "adCampaigns":
        return this.fetchAdResource({ urn, resourceType: 'adCampaigns', params });
      case "creatives":
        return this.fetchAdResource({ urn, resourceType: 'creatives', params, queryType: 'criteria' });
      case "adAnalytics":
        return this.fetchAdAnalytics(urn, params);
      default:
        throw new Error(`Unknown node: ${nodeName}`);
    }
  }

  /**
   * LinkedIn Pages API implementation of fetchData
   * @param {string} nodeName - Type of resource to fetch
   * @param {string|number} urn - Organization ID (numeric)
   * @param {Object} params - Additional parameters for the request
   * @returns {Array} - Array of processed data objects
   */
  fetchPagesData(nodeName, urn, params = {}) {
    switch (nodeName) {
      case "follower_statistics":
        return this.fetchOrganizationStats({
          urn, 
          nodeName,
          endpoint: "organizationalEntityFollowerStatistics",
          entityParam: "organizationalEntity",
          formatter: this.transformFollowerStatistics.bind(this),
          params
        });
      case "follower_statistics_time_bound":
        return this.fetchOrganizationStats({
          urn, 
          nodeName,
          endpoint: "organizationalEntityFollowerStatistics",
          entityParam: "organizationalEntity",
          formatter: this.transformFollowerStatisticsTimeBound.bind(this),
          params
        });
      default:
        throw new Error(`Unknown node: ${nodeName}`);
    }
  }

  /**
   * Fetch organization statistics from LinkedIn Pages API
   * @param {Object} options - Options for the request
   * @param {string|number} options.urn - Organization ID (numeric)
   * @param {string} options.nodeName - The node name from the schema
   * @param {string} options.endpoint - API endpoint name
   * @param {string} options.entityParam - Parameter name for the organization URN
   * @param {Function} options.formatter - Function to format the response data
   * @param {Date} [options.params.startDate] - Start date for time-bound data
   * @param {Date} [options.params.endDate] - End date for time-bound data
   * @param {Array} [options.params.fields] - Additional parameters including fields
   * @returns {Array} - Processed statistics data
   */
  fetchOrganizationStats(options) {
    const { urn, nodeName, endpoint, entityParam, formatter, params } = options;
    const orgUrn = `urn:li:organization:${urn}`;
    const encodedUrn = encodeURIComponent(orgUrn);
    
    let url = `${this.config.BaseUrl.value}${endpoint}?q=${entityParam}&${entityParam}=${encodedUrn}`;
    
    const isTimeSeries = this.fieldsSchema[nodeName].isTimeSeries;

    if (isTimeSeries && params.startDate && params.endDate) {
      const startTimestamp = new Date(params.startDate).getTime();
      const endTimestamp = new Date(params.endDate).getTime();
      url += `&timeIntervals=(timeRange:(start:${startTimestamp},end:${endTimestamp}),timeGranularityType:DAY)`;
    }

    const response = this.makeRequest(url);
    const elements = response.elements || [];
    
    if (elements.length === 0) {
      return [];
    }
    
    return formatter({
      elements,
      orgUrn,
      fields: params.fields
    });
  }
  
  /**
   * Filter object properties by allowed field names
   * @param {Object} dataObj - Original data object
   * @param {Array} fields - Array of allowed field names
   * @returns {Object} - Filtered object with only allowed fields
   */
  filterDataByFields(dataObj, fields) {
    return Object.keys(dataObj)
      .filter(key => fields.includes(key))
      .reduce((obj, key) => {
        obj[key] = dataObj[key];
        return obj;
      }, {});
  }

  /**
   * Process time-bound statistics data
   * @param {Object} params - Parameters object
   * @param {Array} params.elements - API response elements
   * @param {string} params.orgUrn - Organization URN
   * @param {Object} params.options - Original options passed to fetchOrganizationStats
   * @returns {Array} - Processed time-bound statistics
   */
  transformFollowerStatisticsTimeBound({ elements, orgUrn, fields }) {    
    return elements.map(element => {
      const dataObj = {
        organization_urn: element.organizationalEntity,
        time_range_start: element.timeRange.start,
        time_range_end: element.timeRange.end,
        organic_follower_gain: element.followerGains?.organicFollowerGain || 0,
        paid_follower_gain: element.followerGains?.paidFollowerGain || 0,
        follower_counts_by_association_type: element.followerCountsByAssociationType || [],
        follower_counts_by_seniority: element.followerCountsBySeniority || [],
        follower_counts_by_industry: element.followerCountsByIndustry || [],
        follower_counts_by_function: element.followerCountsByFunction || [],
        follower_counts_by_staff_count_range: element.followerCountsByStaffCountRange || [],
        follower_counts_by_geo_country: element.followerCountsByGeoCountry || [],
        follower_counts_by_geo: element.followerCountsByGeo || []
      };
      
      return this.filterDataByFields(dataObj, fields);
    });
  }
  
  /**
   * Extract category types from the API response element
   * @param {Object} element - The API response element
   * @returns {Array} - Array of category type descriptors
   */
  extractCategoryTypes(element) {
    return Object.keys(element)
      .filter(key => 
        // Check if the property is an array containing elements with followerCounts
        Array.isArray(element[key]) && 
        element[key].length > 0 && 
        element[key][0]?.followerCounts !== undefined
      )
      .map(type => {
        // Get the first item from the array, or empty object as fallback
        const firstItem = element[type][0] || {};
        
        // Find a key that is not 'followerCounts' to use as segment name
        const segmentKeys = Object.keys(firstItem).filter(key => key !== 'followerCounts');
                  
        return { type, segmentName: segmentKeys[0] };
      });
  }
  
  /**
   * Transform follower statistics into a denormalized format
   * @param {Object} params - Parameters object
   * @param {Array} params.elements - Response elements from the API
   * @param {string} params.orgUrn - Organization URN
   * @param {Object} params.options - Original options passed to fetchOrganizationStats
   * @returns {Array} - Denormalized follower statistics
   */
  transformFollowerStatistics({ elements, orgUrn, fields }) {
    const results = [];
    const element = elements[0];
    const organizationUrn = element.organizationalEntity || orgUrn;
    const categoryTypes = this.extractCategoryTypes(element);
    
    categoryTypes.forEach(category => {
      const items = element[category.type] || [];
      items.forEach(item => {
        const dataObj = {
          organization_urn: organizationUrn,
          category_type: category.type,
          segment_name: category.segmentName,
          segment_value: item[category.segmentName],
          organic_follower_count: item.followerCounts?.organicFollowerCount || 0,
          paid_follower_count: item.followerCounts?.paidFollowerCount || 0
        };
        
        results.push(this.filterDataByFields(dataObj, fields));
      });
    });
    
    return results;
  }

  /**
   * Make a request to LinkedIn API with proper headers and auth
   * @param {string} url - Full API endpoint URL
   * @param {Object} headers - Optional additional headers
   * @returns {Object} - API response parsed from JSON
   */
  makeRequest(url, headers = {}) {
    console.log(`LinkedIn ${this.apiType} API Request URL:`, url);
    
    const defaultHeaders = {
      "LinkedIn-Version": this.config.Version.value,
      "X-RestLi-Protocol-Version": "2.0.0",
    };
    
    const mergedHeaders = { ...defaultHeaders, ...headers };
    const authUrl = `${url}${url.includes('?') ? '&' : '?'}oauth2_access_token=${this.config.AccessToken.value}`;
    
    const response = EnvironmentAdapter.fetch(authUrl, { headers: mergedHeaders });
    const result = JSON.parse(response.getContentText());
    
    console.log(`LinkedIn ${this.apiType} API Response:`, JSON.stringify(result, null, 2));
    return result;
  }
  
  /**
   * Fetch resources with pagination support
   * @param {string} baseUrl - Base API endpoint URL
   * @param {Object} headers - Optional additional headers
   * @returns {Array} - Combined array of results from all pages
   */
  fetchWithPagination(baseUrl, headers = {}) {
    let allResults = [];
    let pageToken = null;
    
    do {
      let pageUrl = baseUrl;
      if (pageToken) {
        pageUrl += `${pageUrl.includes('?') ? '&' : '?'}pageToken=${encodeURIComponent(pageToken)}`;
      }
      
      const res = this.makeRequest(pageUrl, headers);
      const elements = res.elements || [];
      allResults = allResults.concat(elements);
      
      const metadata = res.metadata || {};
      pageToken = metadata.nextPageToken || null;
    } while (pageToken !== null);
    
    return allResults;
  }
  
  /**
   * Fetch a single resource by ID
   * @param {Object} options - Request options
   * @param {string} options.urn - Resource identifier
   * @param {string} options.resourceType - Type of resource to fetch
   * @param {Object} options.params - Additional parameters for the request
   * @returns {Array} - Array containing the single resource
   */
  fetchSingleResource({ urn, resourceType, params }) {
    let url = `${this.config.BaseUrl.value}${resourceType}/${encodeURIComponent(urn)}`;
    url += `?fields=${LinkedInHelper.formatFields(params.fields)}`;
    
    const result = this.makeRequest(url);
    return [result]; // Return as array to match other endpoints
  }
  
  /**
   * Fetch a collection of resources for an account
   * @param {Object} options - Request options
   * @param {string} options.urn - Account identifier
   * @param {string} options.resourceType - Type of resources to fetch
   * @param {Object} options.params - Additional parameters for the request
   * @param {string} [options.queryType='search'] - Query type parameter
   * @returns {Array} - Array of fetched resources
   */
  fetchAdResource({ urn, resourceType, params, queryType = 'search' }) {
    let url = `${this.config.BaseUrl.value}adAccounts/${encodeURIComponent(urn)}/${resourceType}?q=${queryType}&pageSize=100`;
    url += `&fields=${LinkedInHelper.formatFields(params.fields)}`;
    
    return this.fetchWithPagination(url);
  }
  
  /**
   * Fetch analytics data, handling field limits and data merging
   * @param {string} urn - Account identifier
   * @param {Object} params - Request parameters
   * @param {string} params.startDate - Start date for analytics data
   * @param {string} params.endDate - End date for analytics data
   * @param {Array} params.fields - Fields to fetch
   * @returns {Array} - Combined array of analytics data
   */
  fetchAdAnalytics(urn, params) {
    const startDate = new Date(params.startDate);
    const endDate = new Date(params.endDate);
    const accountUrn = `urn:li:sponsoredAccount:${urn}`;
    const encodedUrn = encodeURIComponent(accountUrn);
    let allResults = [];
    
    // LinkedIn API has a limitation - it allows a maximum of fields per request
    // To overcome this, split fields into chunks and make multiple requests
    const fieldChunks = this.prepareAnalyticsFieldChunks(params.fields || []);
    
    // Process each chunk of fields in separate API requests
    for (const fieldChunk of fieldChunks) {
      const url = this.buildAdAnalyticsUrl({ 
        startDate, 
        endDate, 
        encodedUrn, 
        fields: fieldChunk 
      });
      const res = this.makeRequest(url);
      const elements = res.elements || [];
      
      // Merge results from different chunks into a single dataset
      // Each chunk contains the same rows but different fields
      allResults = this.mergeAnalyticsResults(allResults, elements);
    }
    
    // Transform complex dateRange objects to simple Date objects
    return this.transformAnalyticsDateRanges(allResults);
  }
  
  /**
   * Transform complex dateRange objects to simple Date objects in analytics data
   * @param {Array} analyticsData - Array of analytics data records
   * @returns {Array} - Transformed analytics data
   */
  transformAnalyticsDateRanges(analyticsData) {
    if (!analyticsData || !analyticsData.length) {
      return analyticsData;
    }

    const pad = n => String(n).padStart(2, '0');

    return analyticsData.map(item => {
      const res = { ...item };

      if (res.dateRange?.start) {
        const { year, month, day } = res.dateRange.start;
        res.dateRange = `${year}-${pad(month)}-${pad(day)}`;
      }

      return res;
    });
  }
  
  /**
   * Build URL for analytics API request
   * @param {Object} options - URL building options
   * @param {Date} options.startDate - Start date for analytics data
   * @param {Date} options.endDate - End date for analytics data
   * @param {string} options.encodedUrn - URL-encoded account URN
   * @param {Array} options.fields - Fields to request
   * @returns {string} - Complete API request URL
   */
  buildAdAnalyticsUrl({ startDate, endDate, encodedUrn, fields }) {
    // Construct the URL for the LinkedIn Analytics API
    return `${this.config.BaseUrl.value}adAnalytics?q=statistics` +
      `&dateRange=(start:${LinkedInHelper.formatDateForUrl(startDate)},` +
      `end:${LinkedInHelper.formatDateForUrl(endDate)})` +
      `&pivots=List(CREATIVE,CAMPAIGN,CAMPAIGN_GROUP,ACCOUNT)` +
      `&timeGranularity=DAILY` +
      `&accounts=List(${encodedUrn})` +
      `&fields=${LinkedInHelper.formatFields(fields)}`;
  }
  
  /**
   * Prepare field chunks for analytics API requests
   * @param {Array} fields - Original list of fields to request
   * @returns {Array} - Array of field chunks, each respecting the API field limit
   */
  prepareAnalyticsFieldChunks(fields) {
    // These fields are required in all requests for proper merging
    const requiredFields = ['dateRange', 'pivotValues'];
    
    // Remove duplicates and required fields from the user fields
    // Add required fields to each chunk separately
    const uniqueFields = [...new Set(fields)].filter(field => !requiredFields.includes(field));
    
    const maxCustomFieldsPerChunk = this.config.MaxFieldsPerRequest.value - requiredFields.length;
    const fieldChunks = [];
    
    for (let i = 0; i < uniqueFields.length; i += maxCustomFieldsPerChunk) {
      const customFields = uniqueFields.slice(i, i + maxCustomFieldsPerChunk);
      const chunk = [...requiredFields, ...customFields];
      
      fieldChunks.push(chunk);
    }
    
    // Handle the case when there are no custom fields at all
    if (fieldChunks.length === 0) {
      fieldChunks.push([...requiredFields]);
    }
    
    return fieldChunks;
  }
  
  /**
   * Merge results from multiple analytics API requests
   * @param {Array} existingResults - The existing results array
   * @param {Array} newElements - New elements to merge
   * @returns {Array} - The combined results array
   */
  mergeAnalyticsResults(existingResults, newElements) {
    // If there are no existing results, return the new elements
    if (existingResults.length === 0) {
      return [...newElements];
    }

    const mergedResults = [...existingResults];
    
    // For each new element, check if it already exists in the results
    // The uniqueness of a row is determined by dateRange and pivotValues
    newElements.forEach(newElem => {
      // Find existing element with the same dateRange and pivotValues
      // These two fields uniquely identify each data point in the analytics data
      const existingIndex = mergedResults.findIndex(existing =>
        JSON.stringify(existing.dateRange) === JSON.stringify(newElem.dateRange) &&
        JSON.stringify(existing.pivotValues) === JSON.stringify(newElem.pivotValues)
      );
      
      if (existingIndex >= 0) {
        // If element with the same key exists, merge its fields with the new element's fields
        // This combines metrics from different requests into a single comprehensive record
        mergedResults[existingIndex] = { ...mergedResults[existingIndex], ...newElem };
      } else {
        // If no matching element exists, add the new element to the results
        mergedResults.push(newElem);
      }
    });
    
    return mergedResults;
  }
};
