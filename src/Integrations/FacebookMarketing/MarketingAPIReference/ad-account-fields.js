/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var adAccountFields = {

'id': {
  'description': 'The string act_{ad_account_id}.',
  'type': 'string'
},
'account_id': {
  'description': 'The ID of the Ad Account.',
  'type': 'numeric string'
},
'account_status': {
  'description': 'Status of the account:',
  'type': 'unsigned int32'
},
'ad_account_promotable_objects': {
  'description': 'Ad Account creation request purchase order fields associated with this Ad Account.',
  'type': 'AdAccountPromotableObjects'
},
'age': {
  'description': 'Amount of time the ad account has been open, in days.',
  'type': 'float'
},
'agency_client_declaration': {
  'description': 'Details of the agency advertising on behalf of this client account, if applicable. Requires Business Manager Admin privileges.',
  'type': 'AgencyClientDeclaration'
},
'amount_spent': {
  'description': 'Current amount spent by the account with respect to spend_cap. Or total amount in the absence of spend_cap.',
  'type': 'numeric string'
},
'attribution_spec': {
  'description': 'Deprecated due to iOS 14 changes. Please visit the changelog for more information.',
  'type': 'list<AttributionSpec>'
},
'balance': {
  'description': 'Bill amount due for this Ad Account.',
  'type': 'numeric string'
},
'brand_safety_content_filter_levels': {
  'description': 'Brand safety content filter levels set for in-content ads (Facebook in-stream videos and Ads on Facebook Reels) and Audience Network along with feed ads (Facebook Feed, Instagram feed, Facebook Reels feed and Instagram Reels feed) if applicable.',
  'type': 'list<string>'
},
'business': {
  'description': 'The Business Manager, if this ad account is owned by one',
  'type': 'Business'
},
'business_city': {
  'description': 'City for business address',
  'type': 'string'
},
'business_country_code': {
  'description': 'Country code for the business address',
  'type': 'string'
},
'business_name': {
  'description': 'The business name for the account',
  'type': 'string'
},
'business_state': {
  'description': 'State abbreviation for business address',
  'type': 'string'
},
'business_street': {
  'description': 'First line of the business street address for the account',
  'type': 'string'
},
'business_street2': {
  'description': 'Second line of the business street address for the account',
  'type': 'string'
},
'business_zip': {
  'description': 'Zip code for business address',
  'type': 'string'
},
'can_create_brand_lift_study': {
  'description': 'If we can create a new automated brand lift study under the Ad Account.',
  'type': 'bool'
},
'capabilities': {
  'description': 'List of capabilities an Ad Account can have. See capabilities',
  'type': 'list<string>'
},
'created_time': {
  'description': 'The time the account was created in ISO 8601 format.',
  'type': 'datetime'
},
'currency': {
  'description': 'The currency used for the account, based on the corresponding value in the account settings. See supported currencies',
  'type': 'string'
},
'default_dsa_beneficiary': {
  'description': 'This is the default value for creating L2 object of dsa_beneficiary',
  'type': 'string'
},
'default_dsa_payor': {
  'description': 'This is the default value for creating L2 object of dsa_payor',
  'type': 'string'
},
'direct_deals_tos_accepted': {
  'description': 'Whether DirectDeals ToS are accepted.',
  'type': 'bool'
},
'disable_reason': {
  'description': 'The reason why the account was disabled. Possible reasons are:',
  'type': 'unsigned int32'
},
'end_advertiser': {
  'description': 'The entity the ads will target. Must be a Facebook Page Alias, Facebook Page ID or an Facebook App ID.',
  'type': 'numeric string'
},
'end_advertiser_name': {
  'description': 'The name of the entity the ads will target.',
  'type': 'string'
},
'existing_customers': {
  'description': 'The custom audience ids that are used by advertisers to define their existing customers. This definition is primarily used by Automated Shopping Ads.',
  'type': 'list<string>'
},
'expired_funding_source_details': {
  'description': 'ID = ID of the payment method',
  'type': 'FundingSourceDetails'
},
'extended_credit_invoice_group': {
  'description': 'The extended credit invoice group that the ad account belongs to',
  'type': 'ExtendedCreditInvoiceGroup'
},
'failed_delivery_checks': {
  'description': 'Failed delivery checks',
  'type': 'list<DeliveryCheck>'
},
'fb_entity': {
  'description': 'fb_entity',
  'type': 'unsigned int32'
},
'funding_source': {
  'description': 'ID of the payment method. If the account does not have a payment method it will still be possible to create ads but these ads will get no delivery. Not available if the account is disabled',
  'type': 'numeric string'
},
'funding_source_details': {
  'description': 'ID = ID of the payment method',
  'type': 'FundingSourceDetails'
},
'has_migrated_permissions': {
  'description': 'Whether this account has migrated permissions',
  'type': 'bool'
},
'has_page_authorized_adaccount': {
  'description': 'Indicates whether a Facebook page has authorized this ad account to place ads with political content. If you try to place an ad with political content using this ad account for this page, and this page has not authorized this ad account for ads with political content, your ad will be disapproved. See Breaking Changes, Marketing API, Ads with Political Content and Facebook Advertising Policies',
  'type': 'bool'
},
'io_number': {
  'description': 'The Insertion Order (IO) number.',
  'type': 'numeric string'
},
'is_attribution_spec_system_default': {
  'description': 'If the attribution specification of ad account is generated from system default values',
  'type': 'bool'
},
'is_direct_deals_enabled': {
  'description': 'Whether the account is enabled to run Direct Deals',
  'type': 'bool'
},
'is_in_3ds_authorization_enabled_market': {
  'description': 'If the account is in a market requiring to go through payment process going through 3DS authorization',
  'type': 'bool'
},
'is_notifications_enabled': {
  'description': 'Get the notifications status of the user for this ad account. This will return true or false depending if notifications are enabled or not',
  'type': 'bool'
},
'is_personal': {
  'description': 'Indicates if this ad account is being used for private, non-business purposes. This affects how value-added tax (VAT) is assessed. Note: This is not related to whether an ad account is attached to a business.',
  'type': 'unsigned int32'
},
'is_prepay_account': {
  'description': 'If this ad account is a prepay. Other option would be a postpay account.',
  'type': 'bool'
},
'is_tax_id_required': {
  'description': 'If tax id for this ad account is required or not.',
  'type': 'bool'
},
'line_numbers': {
  'description': 'The line numbers',
  'type': 'list<integer>'
},
'media_agency': {
  'description': 'The agency, this could be your own business. Must be a Facebook Page Alias, Facebook Page ID or an Facebook App ID. In absence of one, you can use NONE or UNFOUND.',
  'type': 'numeric string'
},
'min_campaign_group_spend_cap': {
  'description': 'The minimum required spend cap of Ad Campaign.',
  'type': 'numeric string'
},
'min_daily_budget': {
  'description': 'The minimum daily budget for this Ad Account',
  'type': 'unsigned int32'
},
'name': {
  'description': 'Name of the account. If not set, the name of the first admin visible to the user will be returned.',
  'type': 'string'
},
'offsite_pixels_tos_accepted': {
  'description': 'Indicates whether the offsite pixel Terms Of Service contract was signed. This feature can be accessible before v2.9',
  'type': 'bool'
},
'owner': {
  'description': 'The ID of the account owner',
  'type': 'numeric string'
},
'partner': {
  'description': 'This could be Facebook Marketing Partner, if there is one. Must be a Facebook Page Alias, Facebook Page ID or an Facebook App ID. In absence of one, you can use NONE or UNFOUND.',
  'type': 'numeric string'
},
'rf_spec': {
  'description': 'Reach and Frequency limits configuration. See Reach and Frequency',
  'type': 'ReachFrequencySpec'
},
'show_checkout_experience': {
  'description': 'Whether or not to show the pre-paid checkout experience to an advertiser. If true, the advertiser is eligible for checkout, or they are already locked in to checkout and haven\'t graduated to postpay.',
  'type': 'bool'
},
'spend_cap': {
  'description': 'The maximum amount that can be spent by this Ad Account. When the amount is reached, all delivery stops. A value of 0 means no spending-cap. Setting a new spend cap only applies to spend AFTER the time at which you set it. Value specified in basic unit of the currency, for example \'cents\' for USD.',
  'type': 'numeric string'
},
'tax_id': {
  'description': 'Tax ID',
  'type': 'string'
},
'tax_id_status': {
  'description': 'VAT status code for the account.',
  'type': 'unsigned int32'
},
'tax_id_type': {
  'description': 'Type of Tax ID',
  'type': 'string'
},
'timezone_id': {
  'description': 'The timezone ID of this ad account',
  'type': 'unsigned int32'
},
'timezone_name': {
  'description': 'Name for the time zone',
  'type': 'string'
},
'timezone_offset_hours_utc': {
  'description': 'Time zone difference from UTC (Coordinated Universal Time).',
  'type': 'float'
},
'tos_accepted': {
  'description': 'Checks if this specific ad account has signed the Terms of Service contracts. Returns 1, if terms were accepted.',
  'type': 'map<string, int32>'
},
'user_tasks': {
  'description': 'user_tasks',
  'type': 'list<string>'
},
'user_tos_accepted': {
  'description': 'Checks if a user has signed the Terms of Service contracts related to the Business that contains a specific ad account. Must include user\'s access token to get information. This verification is not valid for system users.',
  'type': 'map<string, int32>'
}

}  