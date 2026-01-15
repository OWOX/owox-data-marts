/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var adAccountFields = {

'id': {
  'description': 'The string act_{ad_account_id}.',
  'type': DATA_TYPES.STRING
},
'account_id': {
  'description': 'The ID of the Ad Account.',
  'type': DATA_TYPES.STRING
},
'account_status': {
  'description': 'Status of the account:',
  'type': DATA_TYPES.INTEGER
},
// Commented out because this field can cause confusion or errors.
// 'ad_account_promotable_objects': {
//   'description': 'Ad Account creation request purchase order fields associated with this Ad Account.',
//   'type': 'AdAccountPromotableObjects'
// },
'age': {
  'description': 'Amount of time the ad account has been open, in days.',
  'type': DATA_TYPES.NUMBER
},
'agency_client_declaration': {
  'description': 'Details of the agency advertising on behalf of this client account, if applicable. Requires Business Manager Admin privileges.',
  'type': DATA_TYPES.STRING
},
'amount_spent': {
  'description': 'Current amount spent by the account with respect to spend_cap. Or total amount in the absence of spend_cap.',
  'type': DATA_TYPES.STRING
},
'attribution_spec': {
  'description': 'Deprecated due to iOS 14 changes. Please visit the changelog for more information.',
  'type': DATA_TYPES.ARRAY
},
'balance': {
  'description': 'Bill amount due for this Ad Account.',
  'type': DATA_TYPES.STRING
},
'brand_safety_content_filter_levels': {
  'description': 'Brand safety content filter levels set for in-content ads (Facebook in-stream videos and Ads on Facebook Reels) and Audience Network along with feed ads (Facebook Feed, Instagram feed, Facebook Reels feed and Instagram Reels feed) if applicable.',
  'type': DATA_TYPES.ARRAY
},
'business': {
  'description': 'The Business Manager, if this ad account is owned by one',
  'type': DATA_TYPES.STRING
},
'business_city': {
  'description': 'City for business address',
  'type': DATA_TYPES.STRING
},
'business_country_code': {
  'description': 'Country code for the business address',
  'type': DATA_TYPES.STRING
},
'business_name': {
  'description': 'The business name for the account',
  'type': DATA_TYPES.STRING
},
'business_state': {
  'description': 'State abbreviation for business address',
  'type': DATA_TYPES.STRING
},
'business_street': {
  'description': 'First line of the business street address for the account',
  'type': DATA_TYPES.STRING
},
'business_street2': {
  'description': 'Second line of the business street address for the account',
  'type': DATA_TYPES.STRING
},
'business_zip': {
  'description': 'Zip code for business address',
  'type': DATA_TYPES.STRING
},
'can_create_brand_lift_study': {
  'description': 'If we can create a new automated brand lift study under the Ad Account.',
  'type': DATA_TYPES.BOOLEAN
},
'capabilities': {
  'description': 'List of capabilities an Ad Account can have. See capabilities',
  'type': DATA_TYPES.ARRAY
},
'created_time': {
  'description': 'The time the account was created in ISO 8601 format.',
  'type': DATA_TYPES.DATETIME
},
'currency': {
  'description': 'The currency used for the account, based on the corresponding value in the account settings. See supported currencies',
  'type': DATA_TYPES.STRING
},
'default_dsa_beneficiary': {
  'description': 'This is the default value for creating L2 object of dsa_beneficiary',
  'type': DATA_TYPES.STRING
},
'default_dsa_payor': {
  'description': 'This is the default value for creating L2 object of dsa_payor',
  'type': DATA_TYPES.STRING
},
// Commented out because this field can cause confusion or errors.
// 'direct_deals_tos_accepted': {
//   'description': 'Whether DirectDeals ToS are accepted.',
//   'type': DATA_TYPES.BOOLEAN
// },
'disable_reason': {
  'description': 'The reason why the account was disabled. Possible reasons are:',
  'type': DATA_TYPES.INTEGER
},
'end_advertiser': {
  'description': 'The entity the ads will target. Must be a Facebook Page Alias, Facebook Page ID or an Facebook App ID.',
  'type': DATA_TYPES.STRING
},
'end_advertiser_name': {
  'description': 'The name of the entity the ads will target.',
  'type': DATA_TYPES.STRING
},
'existing_customers': {
  'description': 'The custom audience ids that are used by advertisers to define their existing customers. This definition is primarily used by Automated Shopping Ads.',
  'type': DATA_TYPES.ARRAY
},
'expired_funding_source_details': {
  'description': 'ID = ID of the payment method',
  'type': DATA_TYPES.STRING
},
'extended_credit_invoice_group': {
  'description': 'The extended credit invoice group that the ad account belongs to',
  'type': DATA_TYPES.STRING
},
'failed_delivery_checks': {
  'description': 'Failed delivery checks',
  'type': DATA_TYPES.ARRAY
},
'fb_entity': {
  'description': 'fb_entity',
  'type': DATA_TYPES.INTEGER
},
'funding_source': {
  'description': 'ID of the payment method. If the account does not have a payment method it will still be possible to create ads but these ads will get no delivery. Not available if the account is disabled',
  'type': DATA_TYPES.STRING
},
'funding_source_details': {
  'description': 'ID = ID of the payment method',
  'type': DATA_TYPES.STRING
},
'has_migrated_permissions': {
  'description': 'Whether this account has migrated permissions',
  'type': DATA_TYPES.BOOLEAN
},
// Commented out because this field can cause confusion or errors.
// 'has_page_authorized_adaccount': {
//   'description': 'Indicates whether a Facebook page has authorized this ad account to place ads with political content. If you try to place an ad with political content using this ad account for this page, and this page has not authorized this ad account for ads with political content, your ad will be disapproved. See Breaking Changes, Marketing API, Ads with Political Content and Facebook Advertising Policies',
//   'type': DATA_TYPES.BOOLEAN
// },
'io_number': {
  'description': 'The Insertion Order (IO) number.',
  'type': DATA_TYPES.STRING
},
'is_attribution_spec_system_default': {
  'description': 'If the attribution specification of ad account is generated from system default values',
  'type': DATA_TYPES.BOOLEAN
},
'is_direct_deals_enabled': {
  'description': 'Whether the account is enabled to run Direct Deals',
  'type': DATA_TYPES.BOOLEAN
},
'is_in_3ds_authorization_enabled_market': {
  'description': 'If the account is in a market requiring to go through payment process going through 3DS authorization',
  'type': DATA_TYPES.BOOLEAN
},
'is_notifications_enabled': {
  'description': 'Get the notifications status of the user for this ad account. This will return true or false depending if notifications are enabled or not',
  'type': DATA_TYPES.BOOLEAN
},
'is_personal': {
  'description': 'Indicates if this ad account is being used for private, non-business purposes. This affects how value-added tax (VAT) is assessed. Note: This is not related to whether an ad account is attached to a business.',
  'type': DATA_TYPES.INTEGER
},
'is_prepay_account': {
  'description': 'If this ad account is a prepay. Other option would be a postpay account.',
  'type': DATA_TYPES.BOOLEAN
},
'is_tax_id_required': {
  'description': 'If tax id for this ad account is required or not.',
  'type': DATA_TYPES.BOOLEAN
},
'line_numbers': {
  'description': 'The line numbers',
  'type': DATA_TYPES.ARRAY
},
'media_agency': {
  'description': 'The agency, this could be your own business. Must be a Facebook Page Alias, Facebook Page ID or an Facebook App ID. In absence of one, you can use NONE or UNFOUND.',
  'type': DATA_TYPES.STRING
},
'min_campaign_group_spend_cap': {
  'description': 'The minimum required spend cap of Ad Campaign.',
  'type': DATA_TYPES.STRING
},
'min_daily_budget': {
  'description': 'The minimum daily budget for this Ad Account',
  'type': DATA_TYPES.INTEGER
},
'name': {
  'description': 'Name of the account. If not set, the name of the first admin visible to the user will be returned.',
  'type': DATA_TYPES.STRING
},
'offsite_pixels_tos_accepted': {
  'description': 'Indicates whether the offsite pixel Terms Of Service contract was signed. This feature can be accessible before v2.9',
  'type': DATA_TYPES.BOOLEAN
},
'owner': {
  'description': 'The ID of the account owner',
  'type': DATA_TYPES.STRING
},
'partner': {
  'description': 'This could be Facebook Marketing Partner, if there is one. Must be a Facebook Page Alias, Facebook Page ID or an Facebook App ID. In absence of one, you can use NONE or UNFOUND.',
  'type': DATA_TYPES.STRING
},
'rf_spec': {
  'description': 'Reach and Frequency limits configuration. See Reach and Frequency',
  'type': 'ReachFrequencySpec'
},
// Commented out because this field can cause confusion or errors.
// 'show_checkout_experience': {
//   'description': 'Whether or not to show the pre-paid checkout experience to an advertiser. If true, the advertiser is eligible for checkout, or they are already locked in to checkout and haven\'t graduated to postpay.',
//   'type': DATA_TYPES.BOOLEAN
// },
'spend_cap': {
  'description': 'The maximum amount that can be spent by this Ad Account. When the amount is reached, all delivery stops. A value of 0 means no spending-cap. Setting a new spend cap only applies to spend AFTER the time at which you set it. Value specified in basic unit of the currency, for example \'cents\' for USD.',
  'type': DATA_TYPES.STRING
},
'tax_id': {
  'description': 'Tax ID',
  'type': DATA_TYPES.STRING
},
'tax_id_status': {
  'description': 'VAT status code for the account.',
  'type': DATA_TYPES.INTEGER
},
'tax_id_type': {
  'description': 'Type of Tax ID',
  'type': DATA_TYPES.STRING
},
'timezone_id': {
  'description': 'The timezone ID of this ad account',
  'type': DATA_TYPES.INTEGER
},
'timezone_name': {
  'description': 'Name for the time zone',
  'type': DATA_TYPES.STRING
},
'timezone_offset_hours_utc': {
  'description': 'Time zone difference from UTC (Coordinated Universal Time).',
  'type': DATA_TYPES.NUMBER
},
'tos_accepted': {
  'description': 'Checks if this specific ad account has signed the Terms of Service contracts. Returns 1, if terms were accepted.',
  'type': DATA_TYPES.OBJECT
},
'user_tasks': {
  'description': 'user_tasks',
  'type': DATA_TYPES.ARRAY
},
'user_tos_accepted': {
  'description': 'Checks if a user has signed the Terms of Service contracts related to the Business that contains a specific ad account. Must include user\'s access token to get information. This verification is not valid for system users.',
  'type': DATA_TYPES.OBJECT
}

}  