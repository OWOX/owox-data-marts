/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var FacebookMarketingFieldsSchema = {
    "ad-account-user": {
        "overview": "Ad Account User",
        "description": "Someone on Facebook who creates ads. Each ad user can have a role on several ad accounts",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account-user",
        "fields": adAccountUserFields,
        'uniqueKeys': ["id"]
    },
    "ad-account": {
        "overview": "Ad Account",
        "description": "Represents the business entity managing ads.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account/",
        "fields": adAccountFields,
        'uniqueKeys': ["id", "account_id"]
    },  
    "ad-account/adcreatives": {
        "description": "Defines your ad's appearance and content.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account/adcreatives",
        "fields": adAccountCreativesFields,
        'uniqueKeys': ["id"],
        "limit": 100
    },
    "ad-account/adimages": {
        "description": "Library of images to use in ad creatives. Can be uploaded and managed independently.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account/adimages"
    },
    "ad-account/ads": {
        "description": "Data for an ad, such as creative elements and measurement information.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account/ads",
        "fields": adAccountAdsFields,
        'uniqueKeys': ["id"],
        "limit": 100
    },
    "ad-account/adsets": {
        "description": "Contain all ads that share the same budget, schedule, bid, and targeting.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account/adsets"
    },
    "ad-account/advideos": {
        "description": "Library of videos for use in ad creatives. Can be uploaded and managed independently.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account/advideos"
    },
    "ad-account/campaigns": {
        "description": "Define your campaigns' objective and contain one or more ad sets.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account/campaigns"
    },
    "ad-account/customaudiences": {
        "description": "The custom audiences owned by/shared with this ad account.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account/customaudiences"
    },
    "ad-account/insights": {
        "description": "Interface for insights. De-dupes results across child objects, provides sorting, and async reports.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights",
        "fields" : adAccountInsightsFields,
        'uniqueKeys': ["ad_id", "date_start", "date_stop"],
        "limit": 500
    },
    "ad-group": {
        "overview": "Ad",
        "description": "Contains information for an ad, such as creative elements and measurement information.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/adgroup/",
        "fields": adGroupFields,
        'uniqueKeys': ["id"],
        "limit": 100
    },
    "ad-group/adcreatives": {
        "description": "Defines your ad's appearance and content.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/adgroup/adcreatives"
    },
    "ad-group/insights": {
        "description": "Insights on your advertising performance.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/adgroup/insights",
        "fields": adGroupInsightsFields
    },
    "ad-group/leads": {
        "description": "Any leads associated with a Lead Ad.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/adgroup/leads"
    },
    "ad-group/previews": {
        "description": "Generate ad previews from an existing ad.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/adgroup/previews"
     },
    "ad-creative": {
        "overview": "Ad Creative",
        "description": "Format for your image, carousel, collection, or video ad.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-creative/",
        "fields": adCreativeFields
    },
    "ad-creative/previews": {
        "description": "Generate ad previews from the existing ad creative object.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-creative/previews"
    },
    "ad-campaign": {
        "overview": "Ad Set",
        "description": "Contains all ads that share the same budget, schedule, bid, and targeting.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-campaign/",
        "fields": adCampaignFields,
    },
    "ad-campaign/activities": {
        "description": "Log of actions taken on the ad set.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-campaign/activities"
    },
    "ad-campaign/adcreatives": {
        "description": "Defines your ad's content and appearance.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-campaign/adcreatives"
    },
    "ad-campaign/ads": {
        "description": "Data necessary for an ad, such as creative elements and measurement information.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-campagin/ads"
    },
    "ad-campaign/insights": {
        "description": "Insights on your advertising performance.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-campaign/insights"
    },
    "ad-campaign-group": {
        "overview": "Ad Campaign",
        "description": "Defines your ad campaigns' objective. Contains one or more ad set.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group/",
        "fields": adCampaignGroupFields,
    },
    "ad-campaign-group/ads": {
        "description": "Data necessary for an ad, such as creative elements and measurement information.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group/ads"
    },
    "ad-campaign-group/adsets": {
        "description": "Contain all ads that share the same budget, schedule, bid, and targeting.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group/adsets"
    },
    "ad-campaign-group/insights": {
        "description": "Insights on your advertising performance.",
        "documentation": "https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group/insights",
        "fields" : adCampaignInsightsFields
    }
}