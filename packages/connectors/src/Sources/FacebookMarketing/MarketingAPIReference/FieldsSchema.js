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
        "description": "Someone on Facebook who creates ads. Each ad user can have a role on several ad accounts",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account-user",
        "fields": adAccountUserFields,
        'uniqueKeys': ["id"],
        "isTimeSeries": false,
        "destinationName": "facebook_ads_ad_account_user"
    },
    "ad-account": {
        "overview": "Ad Account",
        "description": "Represents the business entity managing ads.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account/",
        "fields": adAccountFields,
        'uniqueKeys': ["id", "account_id"],
        "isTimeSeries": false,
        "destinationName": "facebook_ads_ad_account"
    },  
    "ad-account/adcreatives": {
        "description": "Defines your ad's appearance and content.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account/adcreatives",
        "fields": adAccountCreativesFields,
        'uniqueKeys': ["id"],
        "isTimeSeries": false,
        "destinationName": "facebook_ads_ad_account_adcreatives",
        "limit": 100
    },
    // "ad-account/adimages": {
    //     "description": "Library of images to use in ad creatives. Can be uploaded and managed independently.",
    //     "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account/adimages",
    //     "destinationName": "facebook_ads_ad_account_adimages"
    // },
    "ad-account/ads": {
        "description": "Data for an ad, such as creative elements and measurement information.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account/ads",
        "fields": adAccountAdsFields,
        'uniqueKeys': ["id"],
        "isTimeSeries": false,
        "destinationName": "facebook_ads_ad_account_ads",
        "limit": 100
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
        "description": "Interface for insights. De-dupes results across child objects, provides sorting, and async reports.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights",
        "fields" : adAccountInsightsFields,
        'uniqueKeys': ["ad_id", "date_start", "date_stop"],
        "isTimeSeries": true,
        "destinationName": "facebook_ads_ad_account_insights",
        "limit": 500
    },
    "ad-account/insights-by-country": {
        "description": "Interface for insights with breakdown by country.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights",
        "fields" : adAccountInsightsFieldsByCountry,
        'uniqueKeys': ["ad_id", "date_start", "date_stop", "country"],
        "isTimeSeries": true,
        "destinationName": "facebook_ads_ad_account_insights_by_country",
        "limit": 500
    },
    "ad-account/insights-by-link-url-asset": {
        "description": "Interface for insights with breakdown by link URL asset.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights",
        "fields" : adAccountInsightsFieldsByLinkUrlAsset,
        'uniqueKeys': ["ad_id", "date_start", "date_stop", "link_url_asset"],
        "isTimeSeries": true,
        "destinationName": "facebook_ads_ad_account_insights_by_link_url_asset",
        "limit": 500
    },
    "ad-group": {
        "overview": "Ad",
        "description": "Contains information for an ad, such as creative elements and measurement information.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/adgroup/",
        "fields": adGroupFields,
        'uniqueKeys': ["id"],
        "isTimeSeries": false,
        "destinationName": "facebook_ads_ad_group",
        "limit": 100
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