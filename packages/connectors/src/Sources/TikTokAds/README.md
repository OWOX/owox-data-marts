# TikTok Ads Source

This source allows you to import data from the TikTok Ads platform into Google Sheets. It provides access to advertiser information, campaigns, ad groups, ads, performance metrics, and custom audiences.

## Features

- **Account Data**: Import advertiser account information
- **Campaign Structure**: Access campaigns, ad groups, and ads data
- **Performance Metrics**: Import impressions, clicks, spend, conversions, and more
- **Custom Audiences**: Access audience data for targeting and remarketing
- **Scheduled Imports**: Set up daily or hourly data refreshes
- **Selectable Objects**: Choose which data objects to import (advertisers, campaigns, ad groups, etc.)
- **Incremental Loading**: Update only the latest data to optimize performance
- **Error Handling**: Robust error handling with rate limit protection
- **Data Cleanup**: Automatic cleanup of old data

## Documentation

- [Getting Started Guide](GETTING_STARTED.md) - Instructions for setting up and using the source
- [Authentication Guide](CREDENTIALS.md) - How to obtain and set up TikTok API credentials

## Data Available

The source provides access to the following data types:

1. **Advertiser Information**
   - Account details
   - Basic information about the advertiser
   - Balance and currency information

2. **Campaigns**
   - Campaign structure
   - Budget information
   - Status and targeting
   - Performance optimization settings

3. **Ad Groups**
   - Ad group settings
   - Bidding and budget information
   - Targeting criteria
   - Placement information

4. **Ads**
   - Creative information
   - Status and settings
   - Landing page URLs
   - Call-to-action elements

5. **Performance Metrics**
   - Impressions, clicks, CTR
   - Spend and conversions
   - Video views and engagement metrics
   - Advanced metrics like video completion rates

6. **Custom Audiences**
   - Audience details and size
   - Audience type information
   - Creation and expiration dates
   - Validity status

## Requirements

- A Google account with access to Google Sheets
- A TikTok Business account with advertiser access
- API access token with appropriate permissions

## Setup

1. Make a copy of the TikTok Ads Source template (link to be added when published)
2. Configure your API credentials and desired fields
3. Run the source manually or set up a schedule

For detailed setup instructions, see the [Getting Started Guide](GETTING_STARTED.md).

## Support

If you encounter any issues or have questions about this source:

- Check the documentation first
- Visit the [GitHub repository](https://github.com/OWOX/owox-data-marts)
- Open an issue if you've found a bug
- Join the discussion forum to ask questions

## License

This source is part of the JavaScript Open-Source Sources project and is distributed under the ELv2 license. See the LICENSE file for details. 