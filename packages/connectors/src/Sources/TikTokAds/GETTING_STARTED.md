# Getting Started with TikTok Ads Source

This guide will help you set up and start using the TikTok Ads Source to import your advertising data into Google Sheets.

## Prerequisites

1. A Google account with access to Google Sheets
2. A TikTok For Business account with access to the advertising data you want to import
3. An Access Token for the TikTok Business API (see [CREDENTIALS.md](CREDENTIALS.md) for instructions)

## Setup Instructions

### 1. Copy the Template

1. Copy the [TikTok Ads Connector template in Google Sheets](https://docs.google.com/spreadsheets/d/1u0RwdhYS9DRkVNnHMQ31SsQHAkCnJtKgfVlWmVQnxwg/copy).
2. Rename the copy as desired

### 2. Configure the Source

1. In your copy of the spreadsheet, go to the "Config" sheet
2. Fill in the required configuration parameters:
   - **AccessToken**: Your TikTok Business API access token
   - **AdvertiserIDs**: Comma-separated list of advertiser IDs you want to pull data from
   - **Objects**: Comma-separated list of objects you want to import (e.g., "advertisers, campaigns, ad_groups, ads, ad_insights")
   - **ReimportLookbackWindow**: Number of days to look back when reimporting data (default: 2)
   - **MaxFetchingDays**: Maximum number of days to fetch data for in a single run (default: 31)

#### Sample Objects Configuration

Here's an example of how to configure the Objects parameter:

```
advertisers, campaigns, ad_groups, ads, ad_insights
```

This configuration will fetch:
- "advertisers" data including IDs, names, and other advertiser information
- "campaigns" data with campaign details and settings
- "ad_groups" data with ad group configurations
- "ads" data with ad content and settings
- "ad_insights" performance metrics for all your ads

### 3. Run the Source

There are several ways to run the source:

1. **Manual Run**:
   - From the custom menu, select "OWOX" > "Run Import Process"
   - The import will start immediately and display progress in the "Logs" sheet

2. **Scheduled Run**:
   - To set up a daily run, select "OWOX" > "Schedule" > "Set Daily Schedule"
   - To set up an hourly run, select "OWOX" > "Schedule" > "Set Hourly Schedule"
   - To remove all scheduled runs, select "OWOX" > "Schedule" > "Delete All Schedules"

### 4. View Available Objects

To see all available objects and their fields that can be imported:

1. From the custom menu, select "OWOX" > "Show Available Objects"
2. A complete list of available objects and their fields will be displayed in the "Logs" sheet

## Data Import Details

- **Catalog Data**: Entity data like advertisers, campaigns, ad groups, and ads is fetched immediately
- **Time Series Data**: Performance data (ad_insights) is imported day by day based on the configured lookback window
- **Data Storage**: Each data type is stored in a separate sheet named after the node (e.g., "advertiser", "campaigns", "ad_insights")
- **Data Refresh**: Existing data is updated if it already exists (based on unique keys), otherwise new rows are added

## Troubleshooting

### Common Issues

1. **Authentication Errors**:
   - Verify your access token is valid and not expired
   - TikTok access tokens expire after 24 hours, so ensure you have a fresh token

2. **Missing Data**:
   - Check the date range configuration
   - Ensure you have the correct advertiser IDs
   - Verify that there is data for the selected fields in the specified date range

3. **Rate Limiting**:
   - If you see rate limit errors, try reducing the frequency of your imports
   - TikTok API has rate limits that vary by app type and permission level

4. **Ad Insights Data Level Error**:
   - If you see an error about "Missing required field(s): data_level", make sure you've set the DataLevel parameter
   - Valid values for DataLevel are: AUCTION_ADVERTISER, AUCTION_CAMPAIGN, AUCTION_ADGROUP, AUCTION_AD
   - The data level determines how the metrics are aggregated (by advertiser, campaign, ad group, or ad)
   - If you see an error about "dimensions: Length must be between 1 and 4", this is a TikTok API limitation
   - The source has been adjusted to stay within these limits by selecting the most important dimensions for each data level
   - If you see "Invalid value for dimensions: data_level AUCTION_AD and dimension advertiser_id do not match", the source will automatically attempt to fix the dimensions to match the data level requirements
- If you see "Invalid metric fields", the source will automatically filter out invalid metrics and retry with valid ones

5. **Metric Restrictions**:
   - TikTok API requires that metrics and dimensions be mutually exclusive
   - The source automatically removes dimension fields from the metrics list
   - Some fields like date_start, date_end, and stat_time_day are dimensions, not metrics
   - The source uses a predefined list of valid metrics from the TikTok API
   - If all requested metrics are invalid, the source falls back to common metrics like spend, impressions, and clicks

### Getting Help

If you encounter issues not covered in this guide:

1. Check the "Logs" sheet for specific error messages
2. Please [visit Q&A](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a) first
3. If you want to report a bug, please [open an issue](https://github.com/OWOX/owox-data-marts/issues)
4. Join the [discussion forum](https://github.com/OWOX/owox-data-marts/discussions) to ask questions or propose improvements 