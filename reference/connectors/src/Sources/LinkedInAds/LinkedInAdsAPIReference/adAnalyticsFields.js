/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var adAnalyticsFields = {
  'actionClicks': {
    'description': 'The count of clicks on the action button of the Sponsored Messaging ad.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'adUnitClicks': {
    'description': 'The count of clicks on the ad unit displayed alongside the Sponsored Messaging ad.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'approximateMemberReach': {
    'description': 'Non-demographic pivots only (i.e. not MEMBER_). The estimated number of unique member accounts with at least one impression. This metric is an updated and more accurate version of legacy metric approximateUniqueImpressions. This metric is only available when the number of days in the date range is less than or equal to 92 days. This metric is fully launched in Jan 2024.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'averageDwellTime': {
    'description': 'Average user dwell time (in seconds). It measures the duration for which more than 50% of the ad\'s pixels remain visible in the viewport.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'audiencePenetration': {
    'description': 'The approximate number of unique members reached by the advertiser divided by the approximate total target audience size. The field will be null if the date range has more than 92 days. This metric only supports the CAMPAIGN pivot.',
    'type': 'double',
    'GoogleBigQueryType': 'numeric'
  },
  'cardClicks': {
    'description': 'Non-demographic pivots only (i.e. not MEMBER_). The number of clicks for each card of a carousel ad. The first card click of the carousel ad results in an immediate cardClick and click, whereas scrolling to other cards and clicking will count as additional cardClick.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'cardImpressions': {
    'description': 'Non-demographic pivots only (i.e. not MEMBER_). The number of impressions shown for each card of a carousel ad. The first card of the carousel ad results in an immediate cardImpression and impression, whereas scrolling to other cards will count as additional cardImpressions.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'clicks': {
    'description': 'The count of chargeable clicks. Despite not charging for clicks for CPM campaigns, this field still represents those clicks for which we would otherwise charge advertisers based on objective (for example, clicks to view the landing page or company page).',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'commentLikes': {
    'description': 'The count of likes of a comment. Sponsored Content only.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'comments': {
    'description': 'The count of comments. Sponsored Content only.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'companyPageClicks': {
    'description': 'The count of clicks to view the company page.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'conversionValueInLocalCurrency': {
    'description': 'Non-demographic pivots only (i.e. not MEMBER_). Value of the conversions in the account\'s local currency based on rules defined by the advertiser. Conversion value is set by the advertiser at a per conversion level, and aggregated across the query time range.',
    'type': 'number',
    'GoogleBigQueryType': 'numeric'
  },
  'costInLocalCurrency': {
    'description': 'Cost in the account\'s local currency based on the pivot and timeGranularity. For example, this would be spend by member company size per month if the pivot is MEMBER_COMPANY_SIZE and timeGranularity is MONTHLY. Cost is not adjusted for over delivery when a member professional demographic pivot is specified in the request.',
    'type': 'number',
    'GoogleBigQueryType': 'numeric'
  },
  'costInUsd': {
    'description': 'Cost in USD based on the pivot and timeGranularity. For example, this would be spend by campaign on a given day if the pivot is CAMPAIGN and timeGranularity is DAILY. Cost is not adjusted for over delivery when a member professional demographic pivot is specified in the request.',
    'type': 'number',
    'GoogleBigQueryType': 'numeric'
  },
  'costPerQualifiedLead': {
    'description': 'How much money was spent per qualified lead. Ratio is costInLocalCurrency / qualifiedLeads.',
    'type': 'number',
    'GoogleBigQueryType': 'numeric'
  },
  'dateRangeStart': {
    'description': 'Start date of the report data point. Date is specified in UTC format (YYYY-MM-DD).',
    'type': 'string',
    'GoogleSheetsFormat': '@',
    'GoogleBigQueryType': 'date',
    'GoogleBigQueryPartitioned': true
  },
  'dateRangeEnd': {
    'description': 'End date of the report data point. Date is specified in UTC format (YYYY-MM-DD).',
    'type': 'string',
    'GoogleSheetsFormat': '@',
    'GoogleBigQueryType': 'date',
    'GoogleBigQueryPartitioned': true
  },
  'documentCompletions': {
    'description': 'The number of times users reached 100% of the document\'s length, including those that skipped to this point. This metric is only available for document ads and not all dimensions.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'documentFirstQuartileCompletions': {
    'description': 'The number of times users reached the first quartile of the document\'s length, including those that skipped to this point. This metric is only available for document ads and not all dimensions.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'documentMidpointCompletions': {
    'description': 'The number of times users reached the second quartile of the document\'s length, including those that skipped to this point. This metric is only available for document ads and not all dimensions.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'documentThirdQuartileCompletions': {
    'description': 'The number of times users reached the third quartile of the document\'s length, including those that skipped to this point. This metric is only available for document ads and not all dimensions.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'downloadClicks': {
    'description': 'The number of times users have indicated the intent to download the media in an ad by clicking the download icon. This may or may not result in an actual download (e.g. if the user rejects a browser download prompt). This metric is only available for ad formats supporting media downloads.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'externalWebsiteConversions': {
    'description': 'Total number of times users took a desired action after clicking on or seeing your ad. When conversions cannot be attributed to individual users, group level attribution or estimation may be used.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'externalWebsitePostClickConversions': {
    'description': 'Total number of times users took a desired action after clicking on your ad. When conversions cannot be attributed to individual users, group level attribution or estimation may be used.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'externalWebsitePostViewConversions': {
    'description': 'Total number of times users took a desired action after seeing your ad. When conversions cannot be attributed to individual users, group level attribution or estimation may be used.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'follows': {
    'description': 'The count of follows. Sponsored Content and Follower ads only.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'fullScreenPlays': {
    'description': 'Number of times members click on the full screen button or on the video(mobile only) to go into full screen mode.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'headlineClicks': {
    'description': 'The number of times members clicked on the headline of conversation ads.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'headlineImpressions': {
    'description': 'The number of times members were shown the headline of conversation ads.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'impressions': {
    'description': 'This is the count of impressions for Sponsored Content and sends for Sponsored Messaging.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'jobApplications': {
    'description': 'The number of times a member completed a job application after viewing or clicking on an ad. Currently, this metric is broken down into postViewJobApplications (if the member applied after viewing the ad) and postClickJobApplications (if the member applied after clicking the ad).',
    'type': 'number',
    'GoogleBigQueryType': 'numeric'
  },
  'jobApplyClicks': {
    'description': 'The number of times a member clicked on the job\'s apply button on an LinkedIn jobs page after viewing or clicking on an ad which has a LinkedIn job landing page. Currently, this metric is broken down into postViewJobApplyClicks (if the member performed the action after viewing the ad) and postClickJobApplyClicks (if the member performed the action after clicking the ad).',
    'type': 'number',
    'GoogleBigQueryType': 'numeric'
  },
  'landingPageClicks': {
    'description': 'The count of clicks which take the user to the creative landing page.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'leadGenerationMailContactInfoShares': {
    'description': 'The number of times users shared contact info through the One Click Lead Gen for Sponsored Messaging ads.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'leadGenerationMailInterestedClicks': {
    'description': 'The count of Sponsored Messaging ad recipients who clicked to demonstrate interest.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'likes': {
    'description': 'The count of likes. Sponsored Content only.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'oneClickLeadFormOpens': {
    'description': 'The count of times users opened the lead form for a One Click Lead Gen campaign.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'oneClickLeads': {
    'description': 'The count of leads generated through One Click Lead Gen.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'opens': {
    'description': 'The count of opens of Sponsored Messaging ads.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'otherEngagements': {
    'description': 'The count of user interactions with the ad unit that do not fit into any other more specific category.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'pivotValues': {
    'description': 'The value of the pivots for a specific record returned. For example, supplying pivots of CREATIVE and CONVERSION results in a list of records, one for each creative/conversion combination. The pivotValues contain serialized URNs for the specific creative and conversion for a record. To resolve these URNs to their corresponding entities, refer to LinkedIn Marketing API URN Resolution.',
    'type': 'string[]'
  },
  'postClickJobApplications': {
    'description': 'The number of times a member completed a job application after clicking on an ad. See also jobApplications.',
    'type': 'number',
    'GoogleBigQueryType': 'numeric'
  },
  'postClickJobApplyClicks': {
    'description': 'The number of times a member clicked on the job\'s apply button on an LinkedIn jobs page after clicking on an ad which has a LinkedIn job landing page. See also jobApplyClicks.',
    'type': 'number',
    'GoogleBigQueryType': 'numeric'
  },
  'postClickRegistrations': {
    'description': 'The number of times a member has registered for an event or seminar after clicking on an ad which has a LinkedIn landing page. This includes gross registrations and does not account for a user unregistering.',
    'type': 'number',
    'GoogleBigQueryType': 'numeric'
  },
  'postViewJobApplications': {
    'description': 'The number of times a member completed a job application after viewing an ad. See also jobApplications.',
    'type': 'number',
    'GoogleBigQueryType': 'numeric'
  },
  'postViewJobApplyClicks': {
    'description': 'The number of times a member clicked on the job\'s apply button on an LinkedIn jobs page after clicking an ad which has a LinkedIn job landing page. See also jobApplyClicks.',
    'type': 'number',
    'GoogleBigQueryType': 'numeric'
  },
  'postViewRegistrations': {
    'description': 'The number of times a member has registered for an event or seminar after viewing an ad which has a LinkedIn event landing page. This includes gross registrations and does not account for a user unregistering. See also registrations.',
    'type': 'number',
    'GoogleBigQueryType': 'numeric'
  },
  'qualifiedLeads': {
    'description': 'The count of qualified leads shared by the advertiser. Qualified lead is a lead that has been deemed more likely to become a customer compared to other leads, based on their engagement and fit.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'reactions': {
    'description': 'The count of positive reactions on Sponsored Content which can capture, like, interest, praise, and other responses.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'registrations': {
    'description': 'The number of times a member has registered for an event or seminar after viewing or clicking on an ad which has a LinkedIn event landing page. This includes gross registrations and does not account for a user unregistering.',
    'type': 'number',
    'GoogleBigQueryType': 'numeric'
  },
  'sends': {
    'description': 'The count of sends of Sponsored Messaging ads.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'shares': {
    'description': 'The count of shares. Sponsored Content only.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'subscriptionClicks': {
    'description': 'The count of clicks to subscribe to a series, such as a Newsletter.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'talentLeads': {
    'description': 'Number of leads captured through a talent media campaign.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'textUrlClicks': {
    'description': 'The count of clicks on any links (anchor tags) that were included in the body of the Sponsored Messaging ad.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'totalEngagements': {
    'description': 'The count of all user interactions with the ad unit.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'validWorkEmailLeads': {
    'description': 'The count of leads with a valid work email that does not use an established free or personal email domain.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'videoCompletions': {
    'description': 'The count of video ads that played 97-100% of the video. This includes watches that skipped to this point if the serving location is ON_SITE.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'videoFirstQuartileCompletions': {
    'description': 'The count of video ads that played through the first quartile of the video. This includes watches that skipped to this point if the serving location is ON_SITE.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'videoMidpointCompletions': {
    'description': 'The count of video ads that played through the midpoint of the video. This includes watches that skipped to this point if the serving location is ON_SITE.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'videoStarts': {
    'description': 'The count of video ads that were started by users.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'videoThirdQuartileCompletions': {
    'description': 'The count of video ads that played through the third quartile of the video. This includes watches that skipped to this point if the serving location is ON_SITE.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'videoViews': {
    'description': 'A video ad playing for at least 2 continuous seconds 50% in-view, or a click on the CTA, whichever comes first. An interaction with the video (like going to fullscreen mode) does not count as a view.',
    'type': 'long'
  },
  'viralCardClicks': {
    'description': 'Non-demographic pivots only (i.e. not MEMBER_). The number of viralClicks for each card of a carousel ad. The first viralCardClick of the carousel ad results in an immediate viralCardClick and viralClick, whereas scrolling to other cards and clicking will count as additional viralCardClick.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'viralCardImpressions': {
    'description': 'Non-demographic pivots only (i.e. not MEMBER_). The number of viralImpressions shown for each card of a carousel ad. The first card of the carousel ad results in an immediate viralCardImpression and viralImpression, whereas scrolling to other cards will count as additional viralCardImpressions.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'viralClicks': {
    'description': 'The count of clicks on viral impressions. See viral impressions definition. Sponsored Content only.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'viralCommentLikes': {
    'description': 'The count of likes on comments from viral impressions for this activity. See viral impressions definition. Sponsored Content only.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'viralComments': {
    'description': 'The count of comments from viral impressions for this activity. See viral impressions definition. Sponsored Content only.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'viralCompanyPageClicks': {
    'description': 'The count of clicks to view the company page from viral impressions for this activity. See viral impressions definition. Sponsored Content only.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'viralDocumentCompletions': {
    'description': 'The number of times users reached 100% of the document\'s length on a viral post, including those that skipped to this point. This metric is only available for document ads.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'viralDocumentFirstQuartileCompletions': {
    'description': 'The number of times users reached the first quartile of the document\'s length on a viral post, including those that skipped to this point. This metric is only available for document ads.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'viralDocumentMidpointCompletions': {
    'description': 'The number of times users reached the second quartile of the document\'s length on a viral post, including those that skipped to this point. This metric is only available for document ads.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'viralDocumentThirdQuartileCompletions': {
    'description': 'The number of times users reached the third quartile of the document\'s length on a viral post, including those that skipped to this point. This metric is only available for document ads.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'viralDownloadClicks': {
    'description': 'The number of times users have indicated the intent to download the media in a viral ad by clicking the download icon. This may or may not result in an actual download (e.g. if the user rejects a browser download prompt). Only available for ads supporting media downloads.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'viralExternalWebsiteConversions': {
    'description': 'The count of conversions that are attributed to your ads driven by a viral event. See viral impressions definition.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'viralExternalWebsitePostClickConversions': {
    'description': 'The count of post-click conversions that are attributed to your ads driven by a viral click. See viral impressions definition.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'viralExternalWebsitePostViewConversions': {
    'description': 'The count of post-view conversions that are attributed to your ads driven by a viral impression. See viral impressions definition.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'viralFollows': {
    'description': 'The count of follows from viral impressions for this activity. See viral impressions definition. Sponsored Content only.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'viralFullScreenPlays': {
    'description': 'Number of times members click on the full screen button or on the video(mobile only) to go into full screen mode. See viralImpressions definition.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'viralImpressions': {
    'description': 'The count of viral impressions for this activity. Viral impressions are those resulting from users sharing sponsored content to their own network of connections. Viral impressions are not counted as regular impressions. Sponsored Content only.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'viralJobApplications': {
    'description': 'The number of times a member completed a job application after viewing or clicking on a viral ad. Currently, this metric is broken down into viralPostViewJobApplications (if the member performed the action after viewing the viral ad) and viralPostClickJobApplications (if the member performed the action after clicking the viral ad).',
    'type': 'number',
    'GoogleBigQueryType': 'numeric'
  },
  'viralJobApplyClicks': {
    'description': 'The number of times a member clicked on the job\'s apply button on an LinkedIn jobs page after viewing or clicking on a viral ad which has a LinkedIn job landing page during the date range.Currently, this metric is broken down into viralPostViewJobApplyClicks (if the member performed the action after viewing the viral ad) and viralPostClickJobApplyClicks (if the member performed the action after clicking the viral ad).',
    'type': 'number',
    'GoogleBigQueryType': 'numeric'
  },
  'viralLandingPageClicks': {
    'description': 'The count of clicks on viral impressions to take the user to the creative landing page. See viral impressions definition. Sponsored Content only.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'viralLikes': {
    'description': 'The count of likes from viral impressions for this activity. See viral impressions definition. Sponsored Content only.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'viralOneClickLeadFormOpens': {
    'description': 'The count of times users opened the lead form for viral impressions from a Lead Gen campaign. See viral impressions definition.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'viralOneClickLeads': {
    'description': 'The count of leads generated through One Click Lead Gen from viral impressions for this activity. See viral impressions definition.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'viralOtherEngagements': {
    'description': 'The count of user interactions with viral impressions that do not fit into any other more specific category. See viral impressions definition. Sponsored Content only.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'viralPostClickJobApplications': {
    'description': 'The number of times a member completed a job application after clicking on a viral ad.',
    'type': 'number',
    'GoogleBigQueryType': 'numeric'
  },
  'viralPostClickJobApplyClicks': {
    'description': 'The number of times a member clicked on the job\'s apply button on an LinkedIn jobs page after clicking on a viral ad which has a LinkedIn job landing page.',
    'type': 'number',
    'GoogleBigQueryType': 'numeric'
  },
  'viralPostClickRegistrations': {
    'description': 'The number of times a member has registered for an event or seminar after clicking on a viral ad which has a LinkedIn landing page. See viralImpressions definition. This includes gross registrations and does not account for a user unregistering.',
    'type': 'number',
    'GoogleBigQueryType': 'numeric'
  },
  'viralPostViewJobApplications': {
    'description': 'The number of times a member completed a job application after viewing a viral ad.',
    'type': 'number',
    'GoogleBigQueryType': 'numeric'
  },
  'viralPostViewJobApplyClicks': {
    'description': 'The number of times a member clicked on the job\'s apply button on an LinkedIn jobs page after viewing a viral ad which has a LinkedIn job landing page.',
    'type': 'number',
    'GoogleBigQueryType': 'numeric'
  },
  'viralPostViewRegistrations': {
    'description': 'The number of times a member has registered for an event or seminar after viewing a viral ad which has a LinkedIn event landing page. See viralImpressions definition. This includes gross registrations and does not account for a user unregistering.',
    'type': 'number',
    'GoogleBigQueryType': 'numeric'
  },
  'viralReactions': {
    'description': 'The count of positive reactions on viral Sponsored Content which can capture like, interest, praise, and other responses. See viral impressions definition for details on viral engagements.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'viralRegistrations': {
    'description': 'The number of times a member has registered for an event or seminar after viewing or clicking on a viral ad which has a LinkedIn event landing page. See viralImpressions definition. This includes gross registrations and does not account for a user unregistering.',
    'type': 'number',
    'GoogleBigQueryType': 'numeric'
  },
  'viralShares': {
    'description': 'The count of shares from viral impressions for this activity. See viral impressions definition. Sponsored Content only.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'viralSubscriptionClicks': {
    'description': 'The count of viral clicks to subscribe to a series, such as a Newsletter.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'viralTotalEngagements': {
    'description': 'The count of all user interactions with a viral ad unit. See viral impressions definition. Sponsored Content only.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'viralVideoCompletions': {
    'description': 'The count of viral video ads that played 97-100% of the video. This includes watches that skipped to this point. See viralImpressions definition.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'viralVideoFirstQuartileCompletions': {
    'description': 'The count of viral video ads that played through the first quartile of the video. This includes watches that skipped to this point. See viralImpressions definition.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'viralVideoMidpointCompletions': {
    'description': 'The count of viral video ads that played through the midpoint of the video. This includes watches that skipped to this point. See viralImpressions definition.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'viralVideoStarts': {
    'description': 'The count of viral video ads that were started by users. See viralImpressions definition. Since viral videos are automatically played for ON_SITE, this will be the same as viralImpressions if the servingLocation is ON_SITE.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'viralVideoThirdQuartileCompletions': {
    'description': 'The count of viral video ads that played through the third quartile of the video. This includes watches that skipped to this point. See viralImpressions definition',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'viralVideoViews': {
    'description': 'A viral video ad playing for at least 2 continuous seconds 50% in-view, or a click on the CTA, whichever comes first. An interaction with the video (like going to full screen mode) does not count as a view. See viralImpressions definition.',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
    }
} 