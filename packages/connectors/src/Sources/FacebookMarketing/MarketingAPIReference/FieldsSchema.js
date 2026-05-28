/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 * Commented endpoints will be implemented later.
 */

var FacebookMarketingFieldsSchema = {
    "ad-account-user": {
        "overview": "Ad Account User",
        "description": "Users with access to an ad account and their assigned roles.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account-user",
        "fields": adAccountUserFields,
        'uniqueKeys': ["id"],
        'defaultFields': ["name"],
        "isTimeSeries": false,
        "destinationName": "facebook_ads_ad_account_user"
    },
    "ad-account": {
        "overview": "Ad Account",
        "description": "Your ad account settings, status, currency, and billing details.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account/",
        "fields": adAccountFields,
        'uniqueKeys': ["id", "account_id"],
        'defaultFields': ["name", "account_status", "currency", "timezone_name", "business_name", "created_time"],
        "isTimeSeries": false,
        "destinationName": "facebook_ads_ad_account"
    },
    "ad-account/adcreatives": {
        "overview": "Ad Creatives",
        "description": "The images, videos, text, and other visual elements used in your ads.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account/adcreatives",
        "fields": adAccountCreativesFields,
        'uniqueKeys': ["id"],
        'defaultFields': ["name", "account_id", "status", "body", "title", "call_to_action_type", "object_type", "effective_object_story_id"],
        "isTimeSeries": false,
        "destinationName": "facebook_ads_ad_account_adcreatives"
    },
    // "ad-account/adimages": {
    //     "description": "Library of images to use in ad creatives. Can be uploaded and managed independently.",
    //     "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account/adimages",
    //     "destinationName": "facebook_ads_ad_account_adimages"
    // },
    "ad-account/ads": {
        "overview": "Ads",
        "description": "Individual ads with their status, creative, and campaign hierarchy.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account/ads",
        "fields": adAccountAdsFields,
        'uniqueKeys': ["id"],
        'defaultFields': ["name", "account_id", "status", "effective_status", "adset_id", "campaign_id", "creative_id", "created_time", "updated_time"],
        "isTimeSeries": false,
        "destinationName": "facebook_ads_ad_account_ads"
    },
    // "ad-account/adsets": {
    //     "description": "Contain all ads that share the same budget, schedule, bid, and targeting.",
    //     "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account/adsets",
    //     "destinationName": "facebook_ads_ad_account_adsets"
    // },
    // "ad-account/advideos": {
    //     "description": "Library of videos for use in ad creatives. Can be uploaded and managed independently.",
    //     "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account/advideos",
    //     "destinationName": "facebook_ads_ad_account_advideos"
    // },
    // "ad-account/campaigns": {
    //     "description": "Define your campaigns' objective and contain one or more ad sets.",
    //     "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account/campaigns",
    //     "destinationName": "facebook_ads_ad_account_campaigns"
    // },
    // "ad-account/customaudiences": {
    //     "description": "The custom audiences owned by/shared with this ad account.",
    //     "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account/customaudiences",
    //     "destinationName": "facebook_ads_ad_account_customaudiences"
    // },
    "ad-account/insights": {
        "overview": "Ad Insights",
        "description": "Daily performance metrics for each ad — impressions, clicks, spend, and conversions.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights",
        "fields": adAccountInsightsFields,
        'uniqueKeys': ["ad_id", "date_start", "date_stop"],
        'defaultFields': ["account_id", "account_name", "campaign_id", "campaign_name", "adset_id", "adset_name", "ad_name", "impressions", "reach", "clicks", "spend", "cpc", "cpm", "ctr", "frequency", "actions", "action_values"],
        "isTimeSeries": true,
        "destinationName": "facebook_ads_ad_account_insights"
    },
    "ad-account/insights-by-age-and-gender": {
        "overview": "Ad Insights by Age and Gender",
        "description": "Daily ad performance broken down by audience age range and gender.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights",
        "fields": adAccountInsightsFieldsByAgeAndGender,
        "breakdowns": ["age", "gender"],
        'uniqueKeys': ["ad_id", "date_start", "date_stop", "age", "gender"],
        'defaultFields': ["account_id", "account_name", "campaign_id", "campaign_name", "adset_id", "adset_name", "ad_name", "impressions", "reach", "clicks", "spend", "cpc", "cpm", "ctr", "frequency", "actions", "action_values"],
        "isTimeSeries": true,
        "destinationName": "facebook_ads_ad_account_insights_by_age_and_gender"
    },
    "ad-account/insights-by-country": {
        "overview": "Ad Insights by Country",
        "description": "Daily ad performance broken down by the country where your audience is located.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights",
        "fields": adAccountInsightsFieldsByCountry,
        "breakdowns": ["country"],
        'uniqueKeys': ["ad_id", "date_start", "date_stop", "country"],
        'defaultFields': ["account_currency", "account_id", "account_name", "ad_name", "adset_id", "adset_name", "campaign_id", "campaign_name", "clicks", "impressions", "inline_link_clicks", "reach", "spend"],
        "isTimeSeries": true,
        "destinationName": "facebook_ads_ad_account_insights_by_country"
    },
    "ad-account/insights-by-device-platform": {
        "overview": "Ad Insights by Device Platform",
        "description": "Daily ad performance broken down by the device type your audience used.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights",
        "fields": adAccountInsightsFieldsByDevicePlatform,
        "breakdowns": ["device_platform"],
        'uniqueKeys': ["ad_id", "date_start", "date_stop", "device_platform"],
        'defaultFields': ["account_id", "account_name", "campaign_id", "campaign_name", "adset_id", "adset_name", "ad_name", "impressions", "reach", "clicks", "spend", "cpc", "cpm", "ctr", "frequency", "actions", "action_values"],
        "isTimeSeries": true,
        "destinationName": "facebook_ads_ad_account_insights_by_device_platform"
    },
    "ad-account/insights-by-link-url-asset": {
        "overview": "Ad Insights by Link URL Asset",
        "description": "Daily ad performance broken down by the link URL shown in your ads.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights",
        "fields": adAccountInsightsFieldsByLinkUrlAsset,
        "breakdowns": ["link_url_asset"],
        'uniqueKeys': ["ad_id", "date_start", "date_stop"],
        'defaultFields': ["account_id", "account_name", "campaign_id", "campaign_name", "adset_id", "adset_name", "ad_name", "impressions", "reach", "clicks", "spend", "cpc", "cpm", "ctr", "frequency", "actions", "action_values"],
        "isTimeSeries": true,
        "destinationName": "facebook_ads_ad_account_insights_by_link_url_asset"
    },
    "ad-account/insights-by-product-id": {
        "overview": "Ad Insights by Product ID",
        "description": "Daily ad performance broken down by individual product from your catalog.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights",
        "fields": adAccountInsightsFieldsByProductId,
        "breakdowns": ["product_id"],
        'uniqueKeys': ["ad_id", "date_start", "date_stop", "product_id"],
        'defaultFields': ["account_id", "account_name", "campaign_id", "campaign_name", "adset_id", "adset_name", "ad_name", "impressions", "reach", "clicks", "spend", "cpc", "cpm", "ctr", "frequency", "actions", "action_values"],
        "isTimeSeries": true,
        "destinationName": "facebook_ads_ad_account_insights_by_product_id"
    },
    "ad-account/insights-by-publisher-platform-and-position": {
        "overview": "Ad Insights by Publisher Platform and Position",
        "description": "Daily ad performance broken down by where your ads appeared — platform and placement position.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights",
        "fields": adAccountInsightsFieldsByPublisherPlatformAndPosition,
        "breakdowns": ["publisher_platform", "platform_position"],
        'uniqueKeys': ["ad_id", "date_start", "date_stop", "publisher_platform", "platform_position"],
        'defaultFields': ["account_id", "account_name", "campaign_id", "campaign_name", "adset_id", "adset_name", "ad_name", "impressions", "reach", "clicks", "spend", "cpc", "cpm", "ctr", "frequency", "actions", "action_values"],
        "isTimeSeries": true,
        "destinationName": "facebook_ads_ad_account_insights_by_publisher_platform_and_position"
    },
    "ad-account/insights-by-region": {
        "overview": "Ad Insights by Region",
        "description": "Daily ad performance broken down by the region where your audience is located.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights",
        "fields": adAccountInsightsFieldsByRegion,
        "breakdowns": ["region"],
        'uniqueKeys': ["ad_id", "date_start", "date_stop", "region"],
        'defaultFields': ["account_id", "account_name", "campaign_id", "campaign_name", "adset_id", "adset_name", "ad_name", "impressions", "reach", "clicks", "spend", "cpc", "cpm", "ctr", "frequency", "actions", "action_values"],
        "isTimeSeries": true,
        "destinationName": "facebook_ads_ad_account_insights_by_region"
    },
    "ad-group": {
        "overview": "Ad",
        "description": "Individual ads with their creative, status, and links to their campaign and ad set.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/adgroup/",
        "fields": adGroupFields,
        'uniqueKeys': ["id"],
        'defaultFields': ["account_id", "creative_effective_object_story_id", "creative_name", "creative_object_story_spec", "creative_url_tags", "creative_asset_groups_spec", "name"],
        "isTimeSeries": false,
        "destinationName": "facebook_ads_ad_group"
    },
    // "ad-group/adcreatives": {
    //     "description": "Defines your ad's appearance and content.",
    //     "documentation": "https://developers.facebook.com/docs/marketing-api/reference/adgroup/adcreatives",
    //     "destinationName": "facebook_ads_ad_group_adcreatives"
    // },
    // "ad-group/insights": {
    //     "description": "Insights on your advertising performance.",
    //     "documentation": "https://developers.facebook.com/docs/marketing-api/reference/adgroup/insights",
    //     "fields": adGroupInsightsFields,
    //     "destinationName": "facebook_ads_ad_group_insights"
    // },
    // "ad-group/leads": {
    //     "description": "Any leads associated with a Lead Ad.",
    //     "documentation": "https://developers.facebook.com/docs/marketing-api/reference/adgroup/leads",
    //     "destinationName": "facebook_ads_ad_group_leads"
    // },
    // "ad-group/previews": {
    //     "description": "Generate ad previews from an existing ad.",
    //     "documentation": "https://developers.facebook.com/docs/marketing-api/reference/adgroup/previews",
    //     "destinationName": "facebook_ads_ad_group_previews"
    //  },
    // "ad-creative": {
    //     "overview": "Ad Creative",
    //     "description": "Format for your image, carousel, collection, or video ad.",
    //     "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-creative/",
    //     "fields": adCreativeFields,
    //     "destinationName": "facebook_ads_ad_creative"
    // },
    // "ad-creative/previews": {
    //     "description": "Generate ad previews from the existing ad creative object.",
    //     "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-creative/previews",
    //     "destinationName": "facebook_ads_ad_creative_previews"
    // },
    // "ad-campaign": {
    //     "overview": "Ad Set",
    //     "description": "Contains all ads that share the same budget, schedule, bid, and targeting.",
    //     "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-campaign/",
    //     "fields": adCampaignFields,
    //     "destinationName": "facebook_ads_ad_campaign"
    // },
    // "ad-campaign/activities": {
    //     "description": "Log of actions taken on the ad set.",
    //     "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-campaign/activities",
    //     "destinationName": "facebook_ads_ad_campaign_activities"
    // },
    // "ad-campaign/adcreatives": {
    //     "description": "Defines your ad's content and appearance.",
    //     "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-campaign/adcreatives",
    //     "destinationName": "facebook_ads_ad_campaign_adcreatives"
    // },
    // "ad-campaign/ads": {
    //     "description": "Data necessary for an ad, such as creative elements and measurement information.",
    //     "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-campagin/ads",
    //     "destinationName": "facebook_ads_ad_campaign_ads"
    // },
    // "ad-campaign/insights": {
    //     "description": "Insights on your advertising performance.",
    //     "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-campaign/insights",
    //     "destinationName": "facebook_ads_ad_campaign_insights"
    // },
    // "ad-campaign-group": {
    //     "overview": "Ad Campaign",
    //     "description": "Defines your ad campaigns' objective. Contains one or more ad set.",
    //     "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group/",
    //     "fields": adCampaignGroupFields,
    //     "destinationName": "facebook_ads_ad_campaign_group"
    // },
    // "ad-campaign-group/ads": {
    //     "description": "Data necessary for an ad, such as creative elements and measurement information.",
    //     "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group/ads",
    //     "destinationName": "facebook_ads_ad_campaign_group_ads"
    // },
    // "ad-campaign-group/adsets": {
    //     "description": "Contain all ads that share the same budget, schedule, bid, and targeting.",
    //     "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group/adsets",
    //     "destinationName": "facebook_ads_ad_campaign_group_adsets"
    // },
    // "ad-campaign-group/insights": {
    //     "description": "Insights on your advertising performance.",
    //     "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group/insights",
    //     "fields" : adCampaignInsightsFields,
    //     "destinationName": "facebook_ads_ad_campaign_group_insights"
    // }
}
