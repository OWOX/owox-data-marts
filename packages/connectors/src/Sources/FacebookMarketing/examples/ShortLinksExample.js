/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * Example of using Facebook Marketing Connector with Short Links processing
 * 
 * This example demonstrates how to configure the FacebookMarketingConnector
 * to automatically resolve short links and parse URL parameters from Facebook ads.
 */

// Configuration example for processing short links
const exampleConfig = {
  // Standard Facebook Marketing configuration
  AccessToken: "YOUR_FACEBOOK_ACCESS_TOKEN",
  AccoundIDs: "123456789,987654321", // Comma-separated account IDs
  Fields: "ad-account/insights impressions,clicks,spend,link_url_asset",
  
  // Short Links processing configuration
  ProcessShortLinks: true, // Enable short link processing
  ShortLinkMaxConcurrentRequests: 3, // Max concurrent requests for resolving links
  
  // Optional: Storage configuration
  DestinationTableNamePrefix: "fb_ads_",
  
  // Optional: Date range configuration
  ReimportLookbackWindow: 2,
  MaxFetchingDays: 31
};

/**
 * Example of how processed data will look:
 * 
 * Original Facebook data:
 * {
 *   "ad_id": "123456789",
 *   "impressions": "1000",
 *   "clicks": "50",
 *   "spend": "25.50",
 *   "link_url_asset": {
 *     "website_url": "https://bit.ly/abc123"
 *   }
 * }
 * 
 * After processing with short links:
 * {
 *   "ad_id": "123456789",
 *   "impressions": "1000", 
 *   "clicks": "50",
 *   "spend": "25.50",
 *   "link_url_asset": {
 *     "website_url": "https://bit.ly/abc123",
 *     "parsed_url": "https://example.com/landing?utm_source=facebook&utm_medium=cpc&utm_campaign=test",
 *     "get_params": {
 *       "utm_source": "facebook",
 *       "utm_medium": "cpc", 
 *       "utm_campaign": "test"
 *     }
 *   }
 * }
 */

/**
 * How to use in Google Apps Script:
 * 
 * 1. Create a new Google Apps Script project
 * 2. Include the Facebook Marketing library
 * 3. Configure your sheet with the parameters above
 * 4. Run the connector
 */

function runFacebookMarketingWithShortLinks() {
  // Get configuration from Google Sheet
  const configRange = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName('Config')
    .getRange('A:B');
  
  const config = new AbstractConfig(configRange);
  const source = new FacebookMarketingSource(config);
  const connector = new FacebookMarketingConnector(config, source);
  
  // Start the import process
  connector.startImportProcess();
}

/**
 * Configuration parameters for Short Links processing:
 * 
 * ProcessShortLinks (boolean, default: false)
 * - Enables automatic short link resolution
 * - When true, the connector will detect potential short links in link_url_asset fields
 * - Makes HTTP requests to resolve them to full URLs
 * - Parses GET parameters from resolved URLs
 * 
 * ShortLinkMaxConcurrentRequests (number, default: 5)
 * - Controls how many short links are resolved simultaneously
 * - Lower values reduce load on external services
 * - Higher values speed up processing but may hit rate limits
 * 
 * Short Link Detection Criteria:
 * - URL must be HTTPS
 * - URL must have simple structure: https://domain.com/path
 * - URL must not contain query parameters or UTM parameters
 * - URL must not be already processed
 */

/**
 * Benefits of Short Links processing:
 * 
 * 1. Attribution Analysis
 *    - See full URLs with UTM parameters
 *    - Track campaign performance accurately
 *    - Understand traffic sources
 * 
 * 2. Landing Page Optimization
 *    - Identify which landing pages perform best
 *    - Optimize based on full URL parameters
 *    - Track A/B testing variants
 * 
 * 3. Campaign Insights
 *    - Analyze UTM parameter combinations
 *    - Identify successful campaign naming conventions
 *    - Optimize campaign structure
 * 
 * 4. Compliance & Reporting
 *    - Full visibility into redirect chains
 *    - Ensure compliance with advertising policies
 *    - Detailed reporting for stakeholders
 */ 