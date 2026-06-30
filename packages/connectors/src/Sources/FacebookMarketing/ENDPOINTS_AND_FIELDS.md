# Facebook Marketing Supported Endpoints and Fields

This page lists the Facebook Marketing endpoints and fields currently supported by the OWOX Data Marts Facebook Ads connector. It is intended to be easy for both people and AI tools to parse.

Source of truth: active entries in `MarketingAPIReference/FieldsSchema.js`, the fetch cases in `Source.js`, and the official Meta Marketing API references linked below. Commented-out schema entries are not supported by the connector yet.

Graph API version used by the connector: `v25.0`.

## Supported Endpoints

| OWOX endpoint | Meta API request shape | Fields | Time series | Breakdowns | Unique keys | Destination table | Official Meta reference |
| --- | --- | ---: | --- | --- | --- | --- | --- |
| `ad-account-user` | `act_{account_id}/?fields={fields}` | 2 | no | - | `id` | `facebook_ads_ad_account_user` | [Meta docs](https://developers.facebook.com/docs/marketing-api/reference/ad-account-user) |
| `ad-account` | `act_{account_id}?fields={fields}` | 61 | no | - | `id`, `account_id` | `facebook_ads_ad_account` | [Meta docs](https://developers.facebook.com/docs/marketing-api/reference/ad-account/) |
| `ad-account/adcreatives` | `act_{account_id}/adcreatives?fields={fields}&limit={limit}` | 63 | no | - | `id` | `facebook_ads_ad_account_adcreatives` | [Meta docs](https://developers.facebook.com/docs/marketing-api/reference/ad-account/adcreatives) |
| `ad-account/ads` | `act_{account_id}/ads?fields={fields}&limit={limit}` | 24 | no | - | `id` | `facebook_ads_ad_account_ads` | [Meta docs](https://developers.facebook.com/docs/marketing-api/reference/ad-account/ads) |
| `ad-account/insights` | `act_{account_id}/insights?level=ad&period=day&time_range={time_range}&fields={fields}&limit={limit}` | 100 | yes | - | `ad_id`, `date_start`, `date_stop` | `facebook_ads_ad_account_insights` | [Meta docs](https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights) |
| `ad-account/insights-by-age-and-gender` | `act_{account_id}/insights?level=ad&period=day&time_range={time_range}&fields={fields}&breakdowns=age,gender&limit={limit}` | 102 | yes | `age`, `gender` | `ad_id`, `date_start`, `date_stop`, `age`, `gender` | `facebook_ads_ad_account_insights_by_age_and_gender` | [Meta docs](https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights) |
| `ad-account/insights-by-country` | `act_{account_id}/insights?level=ad&period=day&time_range={time_range}&fields={fields}&breakdowns=country&limit={limit}` | 101 | yes | `country` | `ad_id`, `date_start`, `date_stop`, `country` | `facebook_ads_ad_account_insights_by_country` | [Meta docs](https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights) |
| `ad-account/insights-by-device-platform` | `act_{account_id}/insights?level=ad&period=day&time_range={time_range}&fields={fields}&breakdowns=device_platform&limit={limit}` | 101 | yes | `device_platform` | `ad_id`, `date_start`, `date_stop`, `device_platform` | `facebook_ads_ad_account_insights_by_device_platform` | [Meta docs](https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights) |
| `ad-account/insights-by-link-url-asset` | `act_{account_id}/insights?level=ad&period=day&time_range={time_range}&fields={fields}&breakdowns=link_url_asset&limit={limit}` | 101 | yes | `link_url_asset` | `ad_id`, `date_start`, `date_stop` | `facebook_ads_ad_account_insights_by_link_url_asset` | [Meta docs](https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights) |
| `ad-account/insights-by-product-id` | `act_{account_id}/insights?level=ad&period=day&time_range={time_range}&fields={fields}&breakdowns=product_id&limit={limit}` | 101 | yes | `product_id` | `ad_id`, `date_start`, `date_stop`, `product_id` | `facebook_ads_ad_account_insights_by_product_id` | [Meta docs](https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights) |
| `ad-account/insights-by-publisher-platform-and-position` | `act_{account_id}/insights?level=ad&period=day&time_range={time_range}&fields={fields}&breakdowns=publisher_platform,platform_position&limit={limit}` | 102 | yes | `publisher_platform`, `platform_position` | `ad_id`, `date_start`, `date_stop`, `publisher_platform`, `platform_position` | `facebook_ads_ad_account_insights_by_publisher_platform_and_position` | [Meta docs](https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights) |
| `ad-account/insights-by-region` | `act_{account_id}/insights?level=ad&period=day&time_range={time_range}&fields={fields}&breakdowns=region&limit={limit}` | 101 | yes | `region` | `ad_id`, `date_start`, `date_stop`, `region` | `facebook_ads_ad_account_insights_by_region` | [Meta docs](https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights) |
| `ad-group` | `act_{account_id}/ads?fields={fields}&limit={limit}` | 32 | no | - | `id` | `facebook_ads_ad_group` | [Meta docs](https://developers.facebook.com/docs/marketing-api/reference/adgroup/) |

## Field Table Notes

- **OWOX field** is the field name shown by the connector and written to the destination table.
- **Meta API field** is the field expression requested from Meta. It matches the OWOX field unless a nested API field is required, for example `creative.id`.
- **Type** is the connector data type from the local field schema.
- Insights breakdown endpoints support all base Insights fields plus their listed breakdown fields.

## Non-Insights Endpoint Fields

### ad-account-user

Official reference: [https://developers.facebook.com/docs/marketing-api/reference/ad-account-user](https://developers.facebook.com/docs/marketing-api/reference/ad-account-user)

Source file: `MarketingAPIReference/ad-account-user-fields.js`

| OWOX field | Meta API field | Type | Description |
| --- | --- | --- | --- |
| `id` | `id` | `STRING` | ID of the App Scoped User |
| `name` | `name` | `STRING` | User public full name |

### ad-account

Official reference: [https://developers.facebook.com/docs/marketing-api/reference/ad-account/](https://developers.facebook.com/docs/marketing-api/reference/ad-account/)

Source file: `MarketingAPIReference/ad-account-fields.js`

| OWOX field | Meta API field | Type | Description |
| --- | --- | --- | --- |
| `id` | `id` | `STRING` | The string act_{ad_account_id}. |
| `account_id` | `account_id` | `STRING` | The ID of the Ad Account. |
| `account_status` | `account_status` | `INTEGER` | Status of the account: |
| `age` | `age` | `NUMBER` | Amount of time the ad account has been open, in days. |
| `agency_client_declaration` | `agency_client_declaration` | `STRING` | Details of the agency advertising on behalf of this client account, if applicable. Requires Business Manager Admin privileges. |
| `amount_spent` | `amount_spent` | `STRING` | Current amount spent by the account with respect to spend_cap. Or total amount in the absence of spend_cap. |
| `attribution_spec` | `attribution_spec` | `ARRAY` | Deprecated due to iOS 14 changes. Please visit the changelog for more information. |
| `balance` | `balance` | `STRING` | Bill amount due for this Ad Account. |
| `brand_safety_content_filter_levels` | `brand_safety_content_filter_levels` | `ARRAY` | Brand safety content filter levels set for in-content ads (Facebook in-stream videos and Ads on Facebook Reels) and Audience Network along with feed ads (Facebook Feed, Instagram feed, Facebook Reels feed and Instagram Reels feed) if applicable. |
| `business` | `business` | `STRING` | The Business Manager, if this ad account is owned by one |
| `business_city` | `business_city` | `STRING` | City for business address |
| `business_country_code` | `business_country_code` | `STRING` | Country code for the business address |
| `business_name` | `business_name` | `STRING` | The business name for the account |
| `business_state` | `business_state` | `STRING` | State abbreviation for business address |
| `business_street` | `business_street` | `STRING` | First line of the business street address for the account |
| `business_street2` | `business_street2` | `STRING` | Second line of the business street address for the account |
| `business_zip` | `business_zip` | `STRING` | Zip code for business address |
| `can_create_brand_lift_study` | `can_create_brand_lift_study` | `BOOLEAN` | If we can create a new automated brand lift study under the Ad Account. |
| `capabilities` | `capabilities` | `ARRAY` | List of capabilities an Ad Account can have. See capabilities |
| `created_time` | `created_time` | `DATETIME` | The time the account was created in ISO 8601 format. |
| `currency` | `currency` | `STRING` | The currency used for the account, based on the corresponding value in the account settings. See supported currencies |
| `default_dsa_beneficiary` | `default_dsa_beneficiary` | `STRING` | This is the default value for creating L2 object of dsa_beneficiary |
| `default_dsa_payor` | `default_dsa_payor` | `STRING` | This is the default value for creating L2 object of dsa_payor |
| `disable_reason` | `disable_reason` | `INTEGER` | The reason why the account was disabled. Possible reasons are: |
| `end_advertiser` | `end_advertiser` | `STRING` | The entity the ads will target. Must be a Facebook Page Alias, Facebook Page ID or an Facebook App ID. |
| `end_advertiser_name` | `end_advertiser_name` | `STRING` | The name of the entity the ads will target. |
| `existing_customers` | `existing_customers` | `ARRAY` | The custom audience ids that are used by advertisers to define their existing customers. This definition is primarily used by Automated Shopping Ads. |
| `expired_funding_source_details` | `expired_funding_source_details` | `STRING` | ID = ID of the payment method |
| `extended_credit_invoice_group` | `extended_credit_invoice_group` | `STRING` | The extended credit invoice group that the ad account belongs to |
| `failed_delivery_checks` | `failed_delivery_checks` | `ARRAY` | Failed delivery checks |
| `fb_entity` | `fb_entity` | `INTEGER` | fb_entity |
| `funding_source` | `funding_source` | `STRING` | ID of the payment method. If the account does not have a payment method it will still be possible to create ads but these ads will get no delivery. Not available if the account is disabled |
| `funding_source_details` | `funding_source_details` | `STRING` | ID = ID of the payment method |
| `has_migrated_permissions` | `has_migrated_permissions` | `BOOLEAN` | Whether this account has migrated permissions |
| `io_number` | `io_number` | `STRING` | The Insertion Order (IO) number. |
| `is_attribution_spec_system_default` | `is_attribution_spec_system_default` | `BOOLEAN` | If the attribution specification of ad account is generated from system default values |
| `is_direct_deals_enabled` | `is_direct_deals_enabled` | `BOOLEAN` | Whether the account is enabled to run Direct Deals |
| `is_in_3ds_authorization_enabled_market` | `is_in_3ds_authorization_enabled_market` | `BOOLEAN` | If the account is in a market requiring to go through payment process going through 3DS authorization |
| `is_notifications_enabled` | `is_notifications_enabled` | `BOOLEAN` | Get the notifications status of the user for this ad account. This will return true or false depending if notifications are enabled or not |
| `is_personal` | `is_personal` | `INTEGER` | Indicates if this ad account is being used for private, non-business purposes. This affects how value-added tax (VAT) is assessed. Note: This is not related to whether an ad account is attached to a business. |
| `is_prepay_account` | `is_prepay_account` | `BOOLEAN` | If this ad account is a prepay. Other option would be a postpay account. |
| `is_tax_id_required` | `is_tax_id_required` | `BOOLEAN` | If tax id for this ad account is required or not. |
| `line_numbers` | `line_numbers` | `ARRAY` | The line numbers |
| `media_agency` | `media_agency` | `STRING` | The agency, this could be your own business. Must be a Facebook Page Alias, Facebook Page ID or an Facebook App ID. In absence of one, you can use NONE or UNFOUND. |
| `min_campaign_group_spend_cap` | `min_campaign_group_spend_cap` | `STRING` | The minimum required spend cap of Ad Campaign. |
| `min_daily_budget` | `min_daily_budget` | `INTEGER` | The minimum daily budget for this Ad Account |
| `name` | `name` | `STRING` | Name of the account. If not set, the name of the first admin visible to the user will be returned. |
| `offsite_pixels_tos_accepted` | `offsite_pixels_tos_accepted` | `BOOLEAN` | Indicates whether the offsite pixel Terms Of Service contract was signed. This feature can be accessible before v2.9 |
| `owner` | `owner` | `STRING` | The ID of the account owner |
| `partner` | `partner` | `STRING` | This could be Facebook Marketing Partner, if there is one. Must be a Facebook Page Alias, Facebook Page ID or an Facebook App ID. In absence of one, you can use NONE or UNFOUND. |
| `rf_spec` | `rf_spec` | `OBJECT` | Reach and Frequency limits configuration. See Reach and Frequency |
| `spend_cap` | `spend_cap` | `STRING` | The maximum amount that can be spent by this Ad Account. When the amount is reached, all delivery stops. A value of 0 means no spending-cap. Setting a new spend cap only applies to spend AFTER the time at which you set it. Value specified in basic unit of the currency, for example 'cents' for USD. |
| `tax_id` | `tax_id` | `STRING` | Tax ID |
| `tax_id_status` | `tax_id_status` | `INTEGER` | VAT status code for the account. |
| `tax_id_type` | `tax_id_type` | `STRING` | Type of Tax ID |
| `timezone_id` | `timezone_id` | `INTEGER` | The timezone ID of this ad account |
| `timezone_name` | `timezone_name` | `STRING` | Name for the time zone |
| `timezone_offset_hours_utc` | `timezone_offset_hours_utc` | `NUMBER` | Time zone difference from UTC (Coordinated Universal Time). |
| `tos_accepted` | `tos_accepted` | `OBJECT` | Checks if this specific ad account has signed the Terms of Service contracts. Returns 1, if terms were accepted. |
| `user_tasks` | `user_tasks` | `ARRAY` | user_tasks |
| `user_tos_accepted` | `user_tos_accepted` | `OBJECT` | Checks if a user has signed the Terms of Service contracts related to the Business that contains a specific ad account. Must include user's access token to get information. This verification is not valid for system users. |

### ad-account/adcreatives

Official reference: [https://developers.facebook.com/docs/marketing-api/reference/ad-account/adcreatives](https://developers.facebook.com/docs/marketing-api/reference/ad-account/adcreatives)

Source file: `MarketingAPIReference/ad-account-creatives.js`

| OWOX field | Meta API field | Type | Description |
| --- | --- | --- | --- |
| `id` | `id` | `STRING` | Unique ID for an ad creative, numeric string. |
| `account_id` | `account_id` | `STRING` | Ad account ID for the account this ad creative belongs to. |
| `actor_id` | `actor_id` | `STRING` | The actor ID (Page ID or User ID) of this creative |
| `ad_disclaimer_spec` | `ad_disclaimer_spec` | `STRING` | Ad disclaimer data on creative for additional information on ads. |
| `adlabels` | `adlabels` | `ARRAY` | Ad Labels associated with this creative. Used to group it with related ad objects. |
| `applink_treatment` | `applink_treatment` | `STRING` | Used for Dynamic Ads. Specify what action should occur if a person clicks a link in the ad, but the business' app is not installed on their device. For example, open a webpage displaying the product, or open the app in an app store on the person's mobile device. |
| `asset_feed_spec` | `asset_feed_spec` | `STRING` | Used for Dynamic Creative to automatically experiment and deliver different variations of an ad's creative. Specifies an asset feed with multiple images, text and other assets used to generate variations of an ad. Formatted as a JSON string. |
| `authorization_category` | `authorization_category` | `STRING` | Specifies whether ad was configured to be labeled as a political ad or not. See Facebook Advertising Policies. This field cannot be used for Dynamic Ads. |
| `body` | `body` | `STRING` | The body of the ad. Not supported for video post creatives |
| `branded_content` | `branded_content` | `STRING` | branded_content |
| `branded_content_sponsor_page_id` | `branded_content_sponsor_page_id` | `STRING` | ID for page representing business which runs Branded Content ads. See Creating Branded Content Ads. |
| `bundle_folder_id` | `bundle_folder_id` | `STRING` | The Dynamic Ad's bundle folder ID |
| `call_to_action_type` | `call_to_action_type` | `STRING` | Type of call to action button in your ad. This determines the button text and header text for your ad. See Ads Guide for campaign objectives and permitted call to action types. |
| `categorization_criteria` | `categorization_criteria` | `STRING` | The Dynamic Category Ad's categorization field, e.g. brand |
| `category_media_source` | `category_media_source` | `STRING` | The Dynamic Ad's rendering mode for category ads |
| `collaborative_ads_lsb_image_bank_id` | `collaborative_ads_lsb_image_bank_id` | `STRING` | Used for CPAS local delivery image bank |
| `contextual_multi_ads` | `contextual_multi_ads` | `STRING` | contextual_multi_ads |
| `creative_sourcing_spec` | `creative_sourcing_spec` | `STRING` | creative_sourcing_spec |
| `degrees_of_freedom_spec` | `degrees_of_freedom_spec` | `STRING` | Specifies the types of transformations that are enabled for the given creative |
| `destination_set_id` | `destination_set_id` | `STRING` | The ID of the Product Set for a Destination Catalog that will be used to link with Travel Catalogs |
| `dynamic_ad_voice` | `dynamic_ad_voice` | `STRING` | Used for Store Traffic Objective inside Dynamic Ads. Allows you to control the voice of your ad. If set to DYNAMIC, page name and profile picture in your ad post come from the nearest page location. If set to STORY_OWNER, page name and profile picture in your ad post come from the main page location. |
| `effective_authorization_category` | `effective_authorization_category` | `STRING` | Specifies whether ad is a political ad or not. See Facebook Advertising Policies. This field cannot be used for Dynamic Ads. |
| `effective_instagram_media_id` | `effective_instagram_media_id` | `STRING` | The ID of an Instagram post to use in an ad |
| `effective_object_story_id` | `effective_object_story_id` | `STRING` | The ID of a page post to use in an ad, regardless of whether it's an organic or unpublished page post |
| `enable_direct_install` | `enable_direct_install` | `BOOLEAN` | Whether Direct Install should be enabled on supported devices |
| `enable_launch_instant_app` | `enable_launch_instant_app` | `BOOLEAN` | Whether Instant App should be enabled on supported devices |
| `facebook_branded_content` | `facebook_branded_content` | `STRING` | Stores fields for Facebook Branded Content |
| `image_crops` | `image_crops` | `STRING` | A JSON object defining crop dimensions for the image specified. See image crop reference for more details |
| `image_hash` | `image_hash` | `STRING` | Image hash for ad creative. If provided, do not add image_url. See image library for more details. |
| `image_url` | `image_url` | `STRING` | A URL for the image for this creative. We save the image at this URL to the ad account's image library. If provided, do not include image_hash. |
| `instagram_permalink_url` | `instagram_permalink_url` | `STRING` | URL for a post on Instagram you want to run as an ad. Also known as Instagram media. |
| `instagram_user_id` | `instagram_user_id` | `STRING` | Instagram actor ID |
| `interactive_components_spec` | `interactive_components_spec` | `STRING` | Specification for all the interactive components that would show up on the ad |
| `link_destination_display_url` | `link_destination_display_url` | `STRING` | Overwrites the display URL for link ads when object_url is set to a click tag |
| `link_og_id` | `link_og_id` | `STRING` | The Open Graph (OG) ID for the link in this creative if the landing page has OG tags |
| `link_url` | `link_url` | `STRING` | Identify a specific landing tab on your Facebook page by the Page tab's URL. See connection objects for retrieving Page tab URLs. You can add app_data parameters to the URL to pass data to a Page's tab. |
| `messenger_sponsored_message` | `messenger_sponsored_message` | `STRING` | Used for Messenger sponsored message. JSON string with message for this ad creative. See Messenger Platform, Send API Reference. |
| `name` | `name` | `STRING` | Name of this ad creative as seen in the ad account's library. This field has a limit of 100 characters. |
| `object_id` | `object_id` | `STRING` | ID for Facebook object being promoted with ads or relevant to the ad or ad type. For example a page ID if you are running ads to generate Page Likes. See promoted_object. |
| `object_store_url` | `object_store_url` | `STRING` | iTunes or Google Play of the destination of an app ad |
| `object_story_id` | `object_story_id` | `STRING` | ID of a Facebook Page post to use in an ad. You can get this ID by querying the posts of the page. If this post includes an image, it should not exceed 8 MB. Facebook will upload the image from the post to your ad account's image library. If you create an unpublished page post via object_story_spec at the same time as creating the ad, this ID will be null. However, the effective_object_story_id will be the ID of the page post regardless of whether it's an organic or unpublished page post. |
| `object_story_spec` | `object_story_spec` | `STRING` | Use if you want to create a new unpublished page post and turn the post into an ad. The Page ID and the content to create a new unpublished page post. Specify link_data, photo_data, video_data, text_data or template_data with the content. |
| `object_type` | `object_type` | `STRING` | The type of Facebook object you want to advertise. Allowed values are: |
| `object_url` | `object_url` | `STRING` | URL that opens if someone clicks your link on a link ad. This URL is not connected to a Facebook page. |
| `page_welcome_message` | `page_welcome_message` | `STRING` | Page welcome message for CTM ads |
| `photo_album_source_object_story_id` | `photo_album_source_object_story_id` | `STRING` | photo_album_source_object_story_id |
| `place_page_set_id` | `place_page_set_id` | `STRING` | The ID of the page set for this creative. See theLocal Awareness guide |
| `platform_customizations` | `platform_customizations` | `STRING` | Use this field to specify the exact media to use on different Facebook placements. You can currently use this setting for images and videos. Facebook replaces the media originally defined in ad creative with this media when the ad displays in a specific placements. For example, if you define a media here for instagram, Facebook uses that media instead of the media defined in the ad creative when the ad appears on Instagram. |
| `playable_asset_id` | `playable_asset_id` | `STRING` | The ID of the playable asset in this creative |
| `portrait_customizations` | `portrait_customizations` | `STRING` | This field describes the rendering customizations selected for portrait mode ads like IG Stories, FB Stories, IGTV, etc |
| `product_data` | `product_data` | `ARRAY` | product_data |
| `product_set_id` | `product_set_id` | `STRING` | Used for Dynamic Ad. An ID for a product set, which groups related products or other items being advertised. |
| `recommender_settings` | `recommender_settings` | `STRING` | Used for Dynamic Ads. Settings to display Dynamic ads based on product recommendations. |
| `source_instagram_media_id` | `source_instagram_media_id` | `STRING` | The ID of an Instagram post for creating ads |
| `status` | `status` | `STRING` | The status of the creative. WITH_ISSUES and IN_PROCESS are available for 4.0 or higher |
| `template_url` | `template_url` | `STRING` | Used for Dynamic Ads when you want to use third-party click tracking. See Dynamic Ads, Click Tracking and Templates. |
| `template_url_spec` | `template_url_spec` | `STRING` | Used for Dynamic Ads when you want to use third-party click tracking. See Dynamic Ads, Click Tracking and Templates. |
| `thumbnail_id` | `thumbnail_id` | `STRING` | thumbnail_id |
| `thumbnail_url` | `thumbnail_url` | `STRING` | URL for a thumbnail image for this ad creative. You can provide dimensions for this with thumbnail_width and thumbnail_height. See example. |
| `title` | `title` | `STRING` | Title for link ad, which does not belong to a page. |
| `url_tags` | `url_tags` | `STRING` | A set of query string parameters which will replace or be appended to urls clicked from page post ads, message of the post, and canvas app install creatives only |
| `use_page_actor_override` | `use_page_actor_override` | `BOOLEAN` | Used for App Ads. If true, we display the Facebook page associated with the app ads. |
| `video_id` | `video_id` | `STRING` |  |

### ad-account/ads

Official reference: [https://developers.facebook.com/docs/marketing-api/reference/ad-account/ads](https://developers.facebook.com/docs/marketing-api/reference/ad-account/ads)

Source file: `MarketingAPIReference/ad-account-ads.js`

| OWOX field | Meta API field | Type | Description |
| --- | --- | --- | --- |
| `id` | `id` | `STRING` | The ID of this ad |
| `account_id` | `account_id` | `STRING` | The ID of the ad account that this ad belongs to |
| `ad_active_time` | `ad_active_time` | `STRING` | The time from when the ad was recently active |
| `ad_schedule_end_time` | `ad_schedule_end_time` | `DATETIME` | An optional parameter that defines the end time of an individual ad. If no end time is defined, the ad will run on the campaign's schedule |
| `ad_schedule_start_time` | `ad_schedule_start_time` | `DATETIME` | An optional parameter that defines the start time of an individual ad. If no start time is defined, the ad will run on the campaign's schedule |
| `adlabels` | `adlabels` | `ARRAY` | Ad labels associated with this ad |
| `adset_id` | `adset_id` | `STRING` | ID of the ad set that contains the ad |
| `bid_amount` | `bid_amount` | `INTEGER` | Bid amount for this ad which will be used in auction |
| `campaign_id` | `campaign_id` | `STRING` | ID of the ad campaign that contains this ad |
| `configured_status` | `configured_status` | `STRING` | The configured status of the ad. Use status instead of this field |
| `conversion_domain` | `conversion_domain` | `STRING` | The domain where conversions happen |
| `created_time` | `created_time` | `DATETIME` | Time when the ad was created |
| `creative_id` | `creative.id` | `STRING` | Unique ID for the ad creative |
| `creative_effective_object_story_id` | `creative.effective_object_story_id` | `STRING` | The ID of a page post to use in an ad |
| `creative_name` | `creative.name` | `STRING` | Name of the ad creative |
| `creative_url_tags` | `creative.url_tags` | `STRING` | Query string parameters appended to urls clicked from page post ads |
| `effective_status` | `effective_status` | `STRING` | The effective status of the ad |
| `issues_info` | `issues_info` | `ARRAY` | Issues for this ad that prevented it from delivering |
| `last_updated_by_app_id` | `last_updated_by_app_id` | `STRING` | Indicates the app used for the most recent update of the ad |
| `name` | `name` | `STRING` | Name of the ad |
| `preview_shareable_link` | `preview_shareable_link` | `STRING` | A link that enables users to preview ads in different placements |
| `source_ad_id` | `source_ad_id` | `STRING` | The source ad id that this ad is copied from |
| `status` | `status` | `STRING` | The configured status of the ad |
| `updated_time` | `updated_time` | `DATETIME` | Time when this ad was updated |

### ad-group

Official reference: [https://developers.facebook.com/docs/marketing-api/reference/adgroup/](https://developers.facebook.com/docs/marketing-api/reference/adgroup/)

Source file: `MarketingAPIReference/ad-group-fields.js`

| OWOX field | Meta API field | Type | Description |
| --- | --- | --- | --- |
| `id` | `id` | `STRING` | The ID of this ad. |
| `account_id` | `account_id` | `STRING` | The ID of the ad account that this ad belongs to. |
| `ad_active_time` | `ad_active_time` | `STRING` | The time from when the ad was recently active |
| `ad_review_feedback` | `ad_review_feedback` | `OBJECT` | The review feedback for this ad after it is reviewed. |
| `ad_schedule_end_time` | `ad_schedule_end_time` | `DATETIME` | An optional parameter that defines the end time of an individual ad. If no end time is defined, the ad will run on the campaign’s schedule. |
| `ad_schedule_start_time` | `ad_schedule_start_time` | `DATETIME` | An optional parameter that defines the start time of an individual ad. If no start time is defined, the ad will run on the campaign’s schedule. |
| `adlabels` | `adlabels` | `ARRAY` | Ad labels associated with this ad |
| `adset` | `adset` | `OBJECT` | Ad set that contains this ad |
| `adset_id` | `adset_id` | `STRING` | ID of the ad set that contains the ad |
| `bid_amount` | `bid_amount` | `INTEGER` | Bid amount for this ad which will be used in auction. This value would be the same as the bid_amount field on the ad set. |
| `campaign` | `campaign` | `OBJECT` | Ad campaign that contains this ad |
| `campaign_id` | `campaign_id` | `STRING` | ID of the ad campaign that contains this ad |
| `configured_status` | `configured_status` | `STRING` | The configured status of the ad. Use status instead of this field. |
| `conversion_domain` | `conversion_domain` | `STRING` | The domain where conversions happen. The field is no longer required for creation or update since June 2023. Note that this field should contain only the first and second level domains, and not the full URL. For example facebook.com. |
| `created_time` | `created_time` | `DATETIME` | Time when the ad was created. |
| `creative_id` | `creative.id` | `STRING` | Unique ID for the ad creative |
| `creative_effective_object_story_id` | `creative.effective_object_story_id` | `STRING` | The ID of a page post to use in an ad, regardless of whether its an organic or unpublished page post |
| `creative_name` | `creative.name` | `STRING` | Name of the ad creative as seen in the ad accounts library |
| `creative_object_story_spec` | `creative.object_story_spec` | `STRING` | Object story spec containing page_id and other details |
| `creative_url_tags` | `creative.url_tags` | `STRING` | A set of query string parameters which will replace or be appended to urls clicked from page post ads |
| `creative_asset_groups_spec` | `creative_asset_groups_spec` | `OBJECT` | This field is used to create ads using the Flexible ad format. You can read more about that here |
| `effective_status` | `effective_status` | `STRING` | The effective status of the ad. The status could be effective either because of its own status, or the status of its parent units. WITH_ISSUES is available for version 3.2 or higher. IN_PROCESS is available for version 4.0 or higher |
| `issues_info` | `issues_info` | `ARRAY` | Issues for this ad that prevented it from delivering |
| `last_updated_by_app_id` | `last_updated_by_app_id` | `STRING` | Indicates the app used for the most recent update of the ad. |
| `name` | `name` | `STRING` | Name of the ad. |
| `preview_shareable_link` | `preview_shareable_link` | `STRING` | A link that enables users to preview ads in different placements |
| `recommendations` | `recommendations` | `ARRAY` | If there are recommendations for this ad, this field includes them. Otherwise, it is not included in the response. Field not included in redownload mode. |
| `source_ad` | `source_ad` | `OBJECT` | The source ad that this ad is copied from |
| `source_ad_id` | `source_ad_id` | `STRING` | The source ad id that this ad is copied from |
| `status` | `status` | `STRING` | The configured status of the ad. The field returns the same value as configured_status. Use this field, instead of configured_status. |
| `tracking_specs` | `tracking_specs` | `ARRAY` | With tracking specs, you log actions taken by people on your ad. This field takes arguments identical to action spec. See Tracking and Conversion Specs. |
| `updated_time` | `updated_time` | `DATETIME` | Time when this ad was updated. |

## Insights Endpoint Fields

The connector implements `ad-account/insights` at `level=ad` with `period=day`. The breakdown endpoints below use the same base field set and add one or two breakdown fields.

| OWOX endpoint | Breakdowns request parameter | Extra fields added to base Insights fields | Unique keys | Destination table | Official Meta reference |
| --- | --- | --- | --- | --- | --- |
| `ad-account/insights` | - | - | `ad_id`, `date_start`, `date_stop` | `facebook_ads_ad_account_insights` | [Meta docs](https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights) |
| `ad-account/insights-by-age-and-gender` | `age`, `gender` | `age`, `gender` | `ad_id`, `date_start`, `date_stop`, `age`, `gender` | `facebook_ads_ad_account_insights_by_age_and_gender` | [Meta docs](https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights) |
| `ad-account/insights-by-country` | `country` | `country` | `ad_id`, `date_start`, `date_stop`, `country` | `facebook_ads_ad_account_insights_by_country` | [Meta docs](https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights) |
| `ad-account/insights-by-device-platform` | `device_platform` | `device_platform` | `ad_id`, `date_start`, `date_stop`, `device_platform` | `facebook_ads_ad_account_insights_by_device_platform` | [Meta docs](https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights) |
| `ad-account/insights-by-link-url-asset` | `link_url_asset` | `link_url_asset` | `ad_id`, `date_start`, `date_stop` | `facebook_ads_ad_account_insights_by_link_url_asset` | [Meta docs](https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights) |
| `ad-account/insights-by-product-id` | `product_id` | `product_id` | `ad_id`, `date_start`, `date_stop`, `product_id` | `facebook_ads_ad_account_insights_by_product_id` | [Meta docs](https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights) |
| `ad-account/insights-by-publisher-platform-and-position` | `publisher_platform`, `platform_position` | `platform_position`, `publisher_platform` | `ad_id`, `date_start`, `date_stop`, `publisher_platform`, `platform_position` | `facebook_ads_ad_account_insights_by_publisher_platform_and_position` | [Meta docs](https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights) |
| `ad-account/insights-by-region` | `region` | `region` | `ad_id`, `date_start`, `date_stop`, `region` | `facebook_ads_ad_account_insights_by_region` | [Meta docs](https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights) |

### Base Insights fields

These fields are available for `ad-account/insights` and every `ad-account/insights-by-*` endpoint.

Official reference: [https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights](https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights)

Source file: `MarketingAPIReference/ad-account-insights-fields.js`

| OWOX field | Meta API field | Type | Description |
| --- | --- | --- | --- |
| `account_currency` | `account_currency` | `STRING` | Currency that is used by your ad account. |
| `account_id` | `account_id` | `STRING` | The ID number of your ad account, which groups your advertising activity. Your ad account includes your campaigns, ads and billing. |
| `account_name` | `account_name` | `STRING` | The name of your ad account, which groups your advertising activity. Your ad account includes your campaigns, ads and billing. |
| `action_values` | `action_values` | `ARRAY` | The total value of all conversions attributed to your ads. |
| `actions` | `actions` | `ARRAY` | The total number of actions people took that are attributed to your ads. Actions may include engagement, clicks or conversions. |
| `ad_click_actions` | `ad_click_actions` | `ARRAY` | ad_click_actions |
| `ad_id` | `ad_id` | `STRING` | The unique ID of the ad you're viewing in reporting. |
| `ad_impression_actions` | `ad_impression_actions` | `ARRAY` | ad_impression_actions |
| `ad_name` | `ad_name` | `STRING` | The name of the ad you're viewing in reporting. |
| `adset_id` | `adset_id` | `STRING` | The unique ID of the ad set you're viewing in reporting. An ad set is a group of ads that share the same budget, schedule, delivery optimization and targeting. |
| `adset_name` | `adset_name` | `STRING` | The name of the ad set you're viewing in reporting. An ad set is a group of ads that share the same budget, schedule, delivery optimization and targeting. |
| `attribution_setting` | `attribution_setting` | `STRING` | The default attribution window to be used when attribution result is calculated. Each ad set has its own attribution setting value. The attribution setting for campaign or account is calculated based on existing ad sets. |
| `auction_bid` | `auction_bid` | `NUMBER` | auction_bid |
| `auction_competitiveness` | `auction_competitiveness` | `NUMBER` | auction_competitiveness |
| `auction_max_competitor_bid` | `auction_max_competitor_bid` | `NUMBER` | auction_max_competitor_bid |
| `buying_type` | `buying_type` | `STRING` | The method by which you pay for and target ads in your campaigns: through dynamic auction bidding, fixed-price bidding, or reach and frequency buying. This field is currently only visible at the campaign level. |
| `campaign_id` | `campaign_id` | `STRING` | The unique ID number of the ad campaign you're viewing in reporting. Your campaign contains ad sets and ads. |
| `campaign_name` | `campaign_name` | `STRING` | The name of the ad campaign you're viewing in reporting. Your campaign contains ad sets and ads. |
| `canvas_avg_view_percent` | `canvas_avg_view_percent` | `NUMBER` | The average percentage of the Instant Experience that people saw. An Instant Experience is a screen that opens after someone interacts with your ad on a mobile device. It may include a series of interactive or multimedia components, including video, images product catalog and more. |
| `canvas_avg_view_time` | `canvas_avg_view_time` | `NUMBER` | The average total time, in seconds, that people spent viewing an Instant Experience. An Instant Experience is a screen that opens after someone interacts with your ad on a mobile device. It may include a series of interactive or multimedia components, including video, images product catalog and more. |
| `catalog_segment_actions` | `catalog_segment_actions` | `ARRAY` | The number of actions performed attributed to your ads promoting your catalog segment, broken down by action type. |
| `catalog_segment_value` | `catalog_segment_value` | `ARRAY` | The total value of all conversions from your catalog segment attributed to your ads. |
| `catalog_segment_value_mobile_purchase_roas` | `catalog_segment_value_mobile_purchase_roas` | `ARRAY` | The total return on ad spend (ROAS) from mobile app purchases for your catalog segment. |
| `catalog_segment_value_omni_purchase_roas` | `catalog_segment_value_omni_purchase_roas` | `ARRAY` | The total return on ad spend (ROAS) from all purchases for your catalog segment. |
| `catalog_segment_value_website_purchase_roas` | `catalog_segment_value_website_purchase_roas` | `ARRAY` | The total return on ad spend (ROAS) from website purchases for your catalog segment. |
| `clicks` | `clicks` | `NUMBER` | The number of clicks on your ads. |
| `conversion_values` | `conversion_values` | `ARRAY` | conversion_values |
| `conversions` | `conversions` | `ARRAY` | conversions |
| `converted_product_quantity` | `converted_product_quantity` | `ARRAY` | The number of products purchased which are recorded by your merchant partner's pixel or app SDK for a given product ID and driven by your ads. Has to be used together with converted product ID breakdown. |
| `converted_product_value` | `converted_product_value` | `ARRAY` | The value of purchases recorded by your merchant partner's pixel or app SDK for a given product ID and driven by your ads. Has to be used together with converted product ID breakdown. |
| `cost_per_15_sec_video_view` | `cost_per_15_sec_video_view` | `ARRAY` | cost_per_15_sec_video_view |
| `cost_per_2_sec_continuous_video_view` | `cost_per_2_sec_continuous_video_view` | `ARRAY` | cost_per_2_sec_continuous_video_view |
| `cost_per_action_type` | `cost_per_action_type` | `ARRAY` | The average cost of a relevant action. |
| `cost_per_ad_click` | `cost_per_ad_click` | `ARRAY` | cost_per_ad_click |
| `cost_per_conversion` | `cost_per_conversion` | `ARRAY` | cost_per_conversion |
| `cost_per_dda_countby_convs` | `cost_per_dda_countby_convs` | `NUMBER` | cost_per_dda_countby_convs |
| `cost_per_inline_link_click` | `cost_per_inline_link_click` | `NUMBER` | The average cost of each inline link click. |
| `cost_per_inline_post_engagement` | `cost_per_inline_post_engagement` | `NUMBER` | The average cost of each inline post engagement. |
| `cost_per_one_thousand_ad_impression` | `cost_per_one_thousand_ad_impression` | `ARRAY` | cost_per_one_thousand_ad_impression |
| `cost_per_outbound_click` | `cost_per_outbound_click` | `ARRAY` | The average cost for each outbound click. |
| `cost_per_result` | `cost_per_result` | `ARRAY` | The average cost per result from your ads. |
| `cost_per_thruplay` | `cost_per_thruplay` | `ARRAY` | The average cost for each ThruPlay. This metric is in development. |
| `cost_per_unique_action_type` | `cost_per_unique_action_type` | `ARRAY` | The average cost of each unique action. This metric is estimated. |
| `cost_per_unique_click` | `cost_per_unique_click` | `NUMBER` | The average cost for each unique click (all). This metric is estimated. |
| `cost_per_unique_conversion` | `cost_per_unique_conversion` | `ARRAY` | cost_per_unique_conversion |
| `cost_per_unique_inline_link_click` | `cost_per_unique_inline_link_click` | `NUMBER` | The average cost of each unique inline link click. This metric is estimated. |
| `cost_per_unique_outbound_click` | `cost_per_unique_outbound_click` | `ARRAY` | The average cost for each unique outbound click. This metric is estimated. |
| `cpc` | `cpc` | `NUMBER` | The average cost for each click (all). |
| `cpm` | `cpm` | `NUMBER` | The average cost for 1,000 impressions. |
| `cpp` | `cpp` | `NUMBER` | The average cost to reach 1,000 people. This metric is estimated. |
| `created_time` | `created_time` | `STRING` | created_time |
| `ctr` | `ctr` | `NUMBER` | The percentage of times people saw your ad and performed a click (all). |
| `date_start` | `date_start` | `DATE` | The start date for your data. This is controlled by the date range you've selected for your reporting view. |
| `date_stop` | `date_stop` | `DATE` | The end date for your data. This is controlled by the date range you've selected for your reporting view. |
| `dda_countby_convs` | `dda_countby_convs` | `NUMBER` | dda_countby_convs |
| `dda_results` | `dda_results` | `ARRAY` | dda_results |
| `frequency` | `frequency` | `NUMBER` | The average number of times each person saw your ad. This metric is estimated. |
| `full_view_impressions` | `full_view_impressions` | `NUMBER` | The number of Full Views on your Page's posts as a result of your ad. |
| `full_view_reach` | `full_view_reach` | `NUMBER` | The number of people who performed a Full View on your Page's post as a result of your ad. |
| `impressions` | `impressions` | `NUMBER` | The number of times your ads were on screen. |
| `inline_link_click_ctr` | `inline_link_click_ctr` | `NUMBER` | The percentage of time people saw your ads and performed an inline link click. |
| `inline_link_clicks` | `inline_link_clicks` | `NUMBER` | The number of clicks on links to select destinations or experiences, on or off Facebook-owned properties. Inline link clicks use a fixed 1-day-click attribution window. |
| `inline_post_engagement` | `inline_post_engagement` | `NUMBER` | The total number of actions that people take involving your ads. Inline post engagements use a fixed 1-day-click attribution window. |
| `instagram_upcoming_event_reminders_set` | `instagram_upcoming_event_reminders_set` | `NUMBER` | instagram_upcoming_event_reminders_set |
| `instant_experience_clicks_to_open` | `instant_experience_clicks_to_open` | `NUMBER` | instant_experience_clicks_to_open |
| `instant_experience_clicks_to_start` | `instant_experience_clicks_to_start` | `NUMBER` | instant_experience_clicks_to_start |
| `instant_experience_outbound_clicks` | `instant_experience_outbound_clicks` | `ARRAY` | instant_experience_outbound_clicks |
| `interactive_component_tap` | `interactive_component_tap` | `ARRAY` | interactive_component_tap |
| `marketing_messages_delivery_rate` | `marketing_messages_delivery_rate` | `NUMBER` | The number of messages delivered divided by the number of messages sent. Some messages may not be delivered, such as when a customer's device is out of service. This metric doesn't include messages sent to Europe and Japan. |
| `mobile_app_purchase_roas` | `mobile_app_purchase_roas` | `ARRAY` | The total return on ad spend (ROAS) from mobile app purchases. This is based on the value that you assigned when you set up the app event. |
| `objective` | `objective` | `STRING` | The objective reflecting the goal you want to achieve with your advertising. It may be different from the selected objective of the campaign in some cases. |
| `optimization_goal` | `optimization_goal` | `STRING` | The optimization goal you selected for your ad or ad set. Your optimization goal reflects what you want to optimize for the ads. |
| `outbound_clicks` | `outbound_clicks` | `ARRAY` | The number of clicks on links that take people off Facebook-owned properties. |
| `outbound_clicks_ctr` | `outbound_clicks_ctr` | `ARRAY` | The percentage of times people saw your ad and performed an outbound click. |
| `purchase_roas` | `purchase_roas` | `ARRAY` | The total return on ad spend (ROAS) from purchases. This is based on information received from one or more of your connected Facebook Business Tools and attributed to your ads. |
| `qualifying_question_qualify_answer_rate` | `qualifying_question_qualify_answer_rate` | `NUMBER` | qualifying_question_qualify_answer_rate |
| `reach` | `reach` | `NUMBER` | The number of people who saw your ads at least once. Reach is different from impressions, which may include multiple views of your ads by the same people. This metric is estimated. |
| `result_rate` | `result_rate` | `ARRAY` | The percentage of results you received out of all the views of your ads. |
| `results` | `results` | `ARRAY` | The number of results you received out of all the views of your ads. |
| `shops_assisted_purchases` | `shops_assisted_purchases` | `STRING` | shops_assisted_purchases |
| `social_spend` | `social_spend` | `NUMBER` | The total amount you've spent so far for your ads showed with social information. (ex: Jane Doe likes this). |
| `spend` | `spend` | `NUMBER` | The estimated total amount of money you've spent on your campaign, ad set or ad during its schedule. This metric is estimated. |
| `updated_time` | `updated_time` | `STRING` | updated_time |
| `video_30_sec_watched_actions` | `video_30_sec_watched_actions` | `ARRAY` | The number of times your video played for at least 30 seconds, or for nearly its total length if it's shorter than 30 seconds. For each impression of a video, we'll count video views separately and exclude any time spent replaying the video. |
| `video_avg_time_watched_actions` | `video_avg_time_watched_actions` | `ARRAY` | The average time a video was played, including any time spent replaying the video for a single impression. |
| `video_continuous_2_sec_watched_actions` | `video_continuous_2_sec_watched_actions` | `ARRAY` | video_continuous_2_sec_watched_actions |
| `video_p100_watched_actions` | `video_p100_watched_actions` | `ARRAY` | The number of times your video was played at 100% of its length, including plays that skipped to this point. |
| `video_p25_watched_actions` | `video_p25_watched_actions` | `ARRAY` | The number of times your video was played at 25% of its length, including plays that skipped to this point. |
| `video_p50_watched_actions` | `video_p50_watched_actions` | `ARRAY` | The number of times your video was played at 50% of its length, including plays that skipped to this point. |
| `video_p75_watched_actions` | `video_p75_watched_actions` | `ARRAY` | The number of times your video was played at 75% of its length, including plays that skipped to this point. |
| `video_p95_watched_actions` | `video_p95_watched_actions` | `ARRAY` | The number of times your video was played at 95% of its length, including plays that skipped to this point. |
| `video_play_actions` | `video_play_actions` | `ARRAY` | The number of times your video starts to play. This is counted for each impression of a video, and excludes replays. This metric is in development. |
| `video_play_curve_actions` | `video_play_curve_actions` | `ARRAY` | A video-play based curve graph that illustrates the percentage of video plays that reached a given second. Entries 0 to 14 represent seconds 0 thru 14. Entries 15 to 17 represent second ranges [15 to 20), [20 to 25), and [25 to 30). Entries 18 to 20 represent second ranges [30 to 40), [40 to 50), and [50 to 60). Entry 21 represents plays over 60 seconds. |
| `video_play_retention_0_to_15s_actions` | `video_play_retention_0_to_15s_actions` | `ARRAY` | video_play_retention_0_to_15s_actions |
| `video_play_retention_20_to_60s_actions` | `video_play_retention_20_to_60s_actions` | `ARRAY` | video_play_retention_20_to_60s_actions |
| `video_play_retention_graph_actions` | `video_play_retention_graph_actions` | `ARRAY` | video_play_retention_graph_actions |
| `video_time_watched_actions` | `video_time_watched_actions` | `ARRAY` | video_time_watched_actions |
| `website_ctr` | `website_ctr` | `ARRAY` | The percentage of times people saw your ad and performed a link click. |
| `website_purchase_roas` | `website_purchase_roas` | `ARRAY` | The total return on ad spend (ROAS) from website purchases. This is based on the value of all conversions recorded by the Facebook pixel on your website and attributed to your ads. |
| `wish_bid` | `wish_bid` | `NUMBER` | wish_bid |

### Breakdown-only fields

| OWOX endpoint | Additional OWOX field | Meta API field | Type | Description |
| --- | --- | --- | --- | --- |
| `ad-account/insights-by-age-and-gender` | `age` | `age` | `STRING` | The age range of the people who saw your ad. This is based on the age people have listed in their Facebook profiles. |
| `ad-account/insights-by-age-and-gender` | `gender` | `gender` | `STRING` | The gender of the people who saw your ad. This is based on the gender people have listed in their Facebook profiles. |
| `ad-account/insights-by-country` | `country` | `country` | `STRING` | The country where the people you've reached are located. This is based on information, such as a person's hometown, their current city, and the geographical location where they tend to be when they visit Meta. |
| `ad-account/insights-by-device-platform` | `device_platform` | `device_platform` | `STRING` | device_platform |
| `ad-account/insights-by-link-url-asset` | `link_url_asset` | `link_url_asset` | `OBJECT` | The ID of the URL asset involved in impression, click or action. |
| `ad-account/insights-by-product-id` | `product_id` | `product_id` | `STRING` | The ID of the product associated with the ad. |
| `ad-account/insights-by-publisher-platform-and-position` | `platform_position` | `platform_position` | `STRING` | platform_position |
| `ad-account/insights-by-publisher-platform-and-position` | `publisher_platform` | `publisher_platform` | `STRING` | Which platform your ad was shown, for example on Facebook, Instagram, or Audience Network. |
| `ad-account/insights-by-region` | `region` | `region` | `STRING` | The region where your ads were shown. |

## Local Source Files

- `Source.js` defines the implemented API request cases and uses Meta Graph API `v25.0`.
- `MarketingAPIReference/FieldsSchema.js` defines the active OWOX endpoint IDs, destination table names, unique keys, time-series flags, breakdowns, and official Meta reference links.
- `MarketingAPIReference/*-fields.js` defines the connector-supported fields listed on this page.
