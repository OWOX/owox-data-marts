"""
LinkedIn Ads Configuration and Field Mappings
Based on the backend LinkedIn service implementation
"""

# LinkedIn API Configuration
LINKEDIN_CONFIG = {
    "base_url": "https://api.linkedin.com/rest/",
    "api_version": "202504",
    "max_fields_per_request": 20
}

# LinkedIn Ads Analytics Fields (from backend service)
LINKEDIN_ADS_ANALYTICS_FIELDS = [
    # Date dimensions
    "dateRange",
    "pivotValue",
    
    # Campaign identifiers
    "campaign",
    "campaignGroup",
    "account",
    
    # Creative dimensions
    "creative",
    "adCreative",
    
    # Targeting dimensions
    "audienceSegment",
    "conversionType",
    "countryCode",
    "region",
    "jobFunction",
    "jobSeniority",
    "industry",
    "companySize",
    
    # Performance metrics
    "clicks",
    "impressions",
    "costInUsd",
    "costInLocalCurrency",
    "spend",
    "conversions",
    "conversionValue",
    "reach",
    "frequency",
    "videoViews",
    "videoFirstQuartileCompletions",
    "videoMidpointCompletions",
    "videoThirdQuartileCompletions",
    "videoCompletions",
    "videoViewsAt25Percent",
    "videoViewsAt50Percent",
    "videoViewsAt75Percent",
    "videoViewsAt100Percent",
    
    # Engagement metrics
    "likes",
    "comments",
    "shares",
    "follows",
    "opens",
    "sends",
    "otherEngagements",
    
    # Lead generation
    "leadGenerationMailContactInfoShares",
    "leadGenerationMailInterestedClicks",
    
    # Brand awareness
    "approximateUniqueImpressions",
    "viralClicks",
    "viralImpressions",
    "viralReach",
    
    # Cost metrics
    "cpm",
    "cpc",
    "ctr",
    "conversionRate",
    "costPerConversion",
    "roas",
    
    # Time dimensions
    "year",
    "month",
    "week",
    "day",
    "hour"
]

# Common field groups for different use cases
FIELD_GROUPS = {
    "basic_performance": [
        "dateRange",
        "campaign",
        "impressions",
        "clicks",
        "costInUsd",
        "ctr",
        "cpm",
        "cpc"
    ],
    
    "detailed_metrics": [
        "dateRange",
        "campaign",
        "campaignGroup",
        "impressions",
        "clicks",
        "costInUsd",
        "conversions",
        "conversionRate",
        "reach",
        "frequency",
        "ctr",
        "cpm",
        "cpc"
    ],
    
    "video_performance": [
        "dateRange",
        "campaign",
        "creative",
        "impressions",
        "videoViews",
        "videoViewsAt25Percent",
        "videoViewsAt50Percent",
        "videoViewsAt75Percent",
        "videoViewsAt100Percent",
        "videoCompletions"
    ],
    
    "audience_insights": [
        "dateRange",
        "campaign",
        "countryCode",
        "region",
        "jobFunction",
        "jobSeniority",
        "industry",
        "companySize",
        "impressions",
        "clicks",
        "costInUsd"
    ],
    
    "creative_analysis": [
        "dateRange",
        "campaign",
        "creative",
        "adCreative",
        "impressions",
        "clicks",
        "costInUsd",
        "likes",
        "comments",
        "shares",
        "follows"
    ]
}

# LinkedIn Campaign Group (Account) Types
CAMPAIGN_GROUP_TYPES = [
    "SPONSORED_CONTENT",
    "SPONSORED_MESSAGING", 
    "TEXT_ADS",
    "DYNAMIC_ADS"
]

# LinkedIn Ad Creative Types
CREATIVE_TYPES = [
    "SINGLE_IMAGE_AD",
    "VIDEO_AD",
    "CAROUSEL_AD",
    "COLLECTION_AD",
    "EVENT_AD",
    "DOCUMENT_AD",
    "CONVERSATION_AD",
    "MESSAGE_AD"
]

# Common date range presets
DATE_RANGES = {
    "last_7_days": "LAST_7_DAYS",
    "last_30_days": "LAST_30_DAYS", 
    "this_month": "THIS_MONTH",
    "last_month": "LAST_MONTH",
    "this_quarter": "THIS_QUARTER",
    "last_quarter": "LAST_QUARTER",
    "this_year": "THIS_YEAR",
    "last_year": "LAST_YEAR"
}

# Objective types for campaigns
CAMPAIGN_OBJECTIVES = [
    "AWARENESS",
    "CONSIDERATION", 
    "CONVERSIONS",
    "LEAD_GENERATION",
    "WEBSITE_VISITS",
    "ENGAGEMENT",
    "VIDEO_VIEWS",
    "JOB_APPLICANTS"
]

def get_field_group(group_name: str) -> list:
    """Get predefined field group"""
    return FIELD_GROUPS.get(group_name, [])

def validate_fields(fields: list) -> tuple:
    """Validate if fields are supported"""
    valid_fields = []
    invalid_fields = []
    
    for field in fields:
        if field in LINKEDIN_ADS_ANALYTICS_FIELDS:
            valid_fields.append(field)
        else:
            invalid_fields.append(field)
    
    return valid_fields, invalid_fields

def build_analytics_request(
    account_urns: list,
    start_date: str,
    end_date: str,
    fields: list = None,
    pivot_by: str = "CAMPAIGN"
) -> dict:
    """Build analytics request payload"""
    
    if fields is None:
        fields = get_field_group("basic_performance")
    
    # Validate fields
    valid_fields, invalid_fields = validate_fields(fields)
    
    if invalid_fields:
        print(f"⚠️  Invalid fields will be ignored: {invalid_fields}")
    
    request_payload = {
        "q": "analytics",
        "pivot": pivot_by,
        "dateRange": {
            "start": {
                "year": int(start_date[:4]),
                "month": int(start_date[5:7]),
                "day": int(start_date[8:10])
            },
            "end": {
                "year": int(end_date[:4]),
                "month": int(end_date[5:7]),
                "day": int(end_date[8:10])
            }
        },
        "accounts": account_urns,
        "fields": valid_fields
    }
    
    return request_payload

# Sample configuration for testing
SAMPLE_CONFIG = {
    "test_account_urn": "urn:li:sponsoredAccount:123456789",
    "test_campaign_urn": "urn:li:sponsoredCampaign:987654321",
    "sample_fields": get_field_group("basic_performance"),
    "sample_date_range": {
        "start_date": "2024-01-01",
        "end_date": "2024-01-31"
    }
}
