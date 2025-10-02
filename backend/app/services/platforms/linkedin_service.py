"""
LinkedIn Ads API Service - Fixed Version
Handles LinkedIn Ads data collection and API interactions
"""
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from urllib.parse import quote
import httpx
from app.core.config import settings
from app.models.platform_credential import PlatformCredential
from app.models.data_collection import DataCollection, CollectionStatus

logger = logging.getLogger(__name__)


class LinkedInAdsService:
    """Service for LinkedIn Ads API interactions"""
    
    BASE_URL = "https://api.linkedin.com/rest/"
    API_VERSION = "202504"
    MAX_FIELDS_PER_REQUEST = 20
    
    def __init__(self):
        pass
    
    async def validate_credentials(self, credentials: Dict[str, Any]) -> Dict[str, Any]:
        """Validate LinkedIn API credentials"""
        try:
            access_token = credentials.get("access_token")
            if not access_token:
                return {"valid": False, "error": "Access token is required"}
            
            # Test API call to validate credentials
            async with httpx.AsyncClient() as client:
                headers = {
                    "Authorization": f"Bearer {access_token}",
                    "LinkedIn-Version": self.API_VERSION,
                    "X-RestLi-Protocol-Version": "2.0.0",
                }
                
                # Test with a simple profile call
                response = await client.get(
                    f"{self.BASE_URL}me",
                    headers=headers
                )
                
                if response.status_code == 200:
                    profile_data = response.json()
                    return {
                        "valid": True,
                        "account_info": {
                            "name": profile_data.get("localizedFirstName", "") + " " + profile_data.get("localizedLastName", ""),
                            "id": profile_data.get("id")
                        }
                    }
                else:
                    return {
                        "valid": False,
                        "error": f"API validation failed: {response.status_code}"
                    }
                    
        except Exception as e:
            logger.error(f"LinkedIn credential validation error: {str(e)}")
            return {"valid": False, "error": str(e)}
    
    async def get_ad_accounts(self, credentials: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Fetch LinkedIn Ad Accounts - Enhanced with comprehensive logging"""
        logger.info(f"🚀 [LINKEDIN SERVICE] Starting get_ad_accounts request")
        
        try:
            # Log credentials info (secure)
            access_token = credentials.get("access_token")
            if not access_token:
                logger.error(f"❌ [LINKEDIN SERVICE] No access token provided in credentials")
                raise Exception("Access token is required")
            
            logger.info(f"🔑 [LINKEDIN SERVICE] Access token present: {access_token[:10]}... (length: {len(access_token)})")
            
            # Log other credential info
            other_keys = [k for k in credentials.keys() if k != "access_token"]
            logger.info(f"📋 [LINKEDIN SERVICE] Other credential keys: {other_keys}")
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Use same headers and auth method as analytics
                headers = {
                    "LinkedIn-Version": self.API_VERSION,
                    "X-RestLi-Protocol-Version": "2.0.0",
                }
                logger.info(f"📤 [LINKEDIN SERVICE] Request headers: {headers}")
                
                # Try the correct LinkedIn API endpoint for listing ad accounts
                base_url = f"{self.BASE_URL}adAccounts?q=search"
                auth_url = f"{base_url}&oauth2_access_token={access_token}"
                
                # Log URL (without token for security)
                logger.info(f"🌐 [LINKEDIN SERVICE] Base URL: {base_url}")
                logger.info(f"🌐 [LINKEDIN SERVICE] Full URL with token: {base_url}&oauth2_access_token={access_token[:10]}...")
                
                logger.info(f"📞 [LINKEDIN SERVICE] Making HTTP GET request to LinkedIn API")
                response = await client.get(auth_url, headers=headers)
                
                # Log response details
                logger.info(f"📥 [LINKEDIN SERVICE] Response status: {response.status_code}")
                logger.info(f"📥 [LINKEDIN SERVICE] Response headers: {dict(response.headers)}")
                logger.info(f"📥 [LINKEDIN SERVICE] Response content length: {len(response.content)} bytes")
                
                if response.status_code != 200:
                    logger.error(f"❌ [LINKEDIN SERVICE] API request failed")
                    logger.error(f"❌ [LINKEDIN SERVICE] Status: {response.status_code}")
                    logger.error(f"❌ [LINKEDIN SERVICE] Response text: {response.text}")
                    logger.error(f"❌ [LINKEDIN SERVICE] Response headers: {dict(response.headers)}")
                    
                    # Check for specific error types
                    if response.status_code == 401:
                        logger.error(f"🔐 [LINKEDIN SERVICE] Authentication failed - token may be expired or invalid")
                    elif response.status_code == 403:
                        logger.error(f"🚫 [LINKEDIN SERVICE] Forbidden - insufficient permissions or scope")
                    elif response.status_code == 429:
                        logger.error(f"⏱️ [LINKEDIN SERVICE] Rate limit exceeded")
                    
                    raise Exception(f"LinkedIn API request failed: {response.status_code} - {response.text}")
                
                # Parse response
                logger.info(f"✅ [LINKEDIN SERVICE] API request successful, parsing response")
                try:
                    data = response.json()
                    logger.info(f"📊 [LINKEDIN SERVICE] Parsed JSON response successfully")
                except json.JSONDecodeError as e:
                    logger.error(f"❌ [LINKEDIN SERVICE] Failed to parse JSON response: {str(e)}")
                    logger.error(f"❌ [LINKEDIN SERVICE] Raw response: {response.text}")
                    raise Exception(f"Invalid JSON response from LinkedIn API: {str(e)}")
                
                # Process response data
                elements = data.get("elements", [])
                logger.info(f"📊 [LINKEDIN SERVICE] LinkedIn returned {len(elements)} account elements")
                
                if not elements:
                    logger.warning(f"⚠️ [LINKEDIN SERVICE] No account elements found in response")
                    logger.info(f"📊 [LINKEDIN SERVICE] Full response data: {data}")
                
                accounts = []
                for i, element in enumerate(elements):
                    logger.info(f"🔄 [LINKEDIN SERVICE] Processing element {i+1}/{len(elements)}: {element}")
                    
                    # Convert properly to handle integer IDs
                    account = {
                        "id": str(element.get("id", "")),  # Convert int to string
                        "name": element.get("name", ""),
                        "status": element.get("status", ""),
                        "currency": element.get("currency"),
                        "type": element.get("type")
                    }
                    accounts.append(account)
                    logger.info(f"✅ [LINKEDIN SERVICE] Processed account: {account}")
                
                logger.info(f"🎉 [LINKEDIN SERVICE] Successfully processed {len(accounts)} accounts")
                logger.info(f"📊 [LINKEDIN SERVICE] Final accounts list: {accounts}")
                return accounts
                    
        except Exception as e:
            logger.error(f"❌ [LINKEDIN SERVICE] Error in get_ad_accounts: {type(e).__name__}: {str(e)}")
            logger.exception(f"❌ [LINKEDIN SERVICE] Full traceback:")
            raise
    
    async def collect_ad_analytics(
        self,
        credentials: Dict[str, Any],
        account_urns: List[str],
        start_date: datetime,
        end_date: datetime,
        fields: List[str]
    ) -> List[Dict[str, Any]]:
        """Collect LinkedIn Ads analytics data - Enhanced with comprehensive logging"""
        logger.info(f"🚀 [LINKEDIN ANALYTICS] Starting analytics collection")
        logger.info(f"📅 [LINKEDIN ANALYTICS] Date range: {start_date} to {end_date}")
        logger.info(f"🎯 [LINKEDIN ANALYTICS] Account URNs: {account_urns}")
        logger.info(f"📊 [LINKEDIN ANALYTICS] Requested fields: {fields}")
        
        try:
            access_token = credentials.get("access_token")
            if not access_token:
                logger.error(f"❌ [LINKEDIN ANALYTICS] No access token provided")
                raise Exception("Access token is required")
                
            logger.info(f"🔑 [LINKEDIN ANALYTICS] Access token present: {access_token[:10]}...")
            all_results = []
            
            async with httpx.AsyncClient(timeout=60.0) as client:
                # Use headers matching original TypeScript exactly
                headers = {
                    "LinkedIn-Version": self.API_VERSION,
                    "X-RestLi-Protocol-Version": "2.0.0",
                }
                logger.info(f"📤 [LINKEDIN ANALYTICS] Request headers: {headers}")
                
                for account_index, account_urn in enumerate(account_urns):
                    logger.info(f"🔄 [LINKEDIN ANALYTICS] Processing account {account_index+1}/{len(account_urns)}: {account_urn}")
                    
                    # Prepare field chunks (LinkedIn has field limits)
                    field_chunks = self._prepare_analytics_field_chunks(fields)
                    logger.info(f"📋 [LINKEDIN ANALYTICS] Prepared {len(field_chunks)} field chunks: {field_chunks}")
                    
                    for chunk_index, field_chunk in enumerate(field_chunks):
                        logger.info(f"🔄 [LINKEDIN ANALYTICS] Processing field chunk {chunk_index+1}/{len(field_chunks)}: {field_chunk}")
                        
                        base_url = self._build_analytics_url(
                            account_urn, start_date, end_date, field_chunk
                        )
                        
                        # Add oauth2_access_token as query parameter (like original TypeScript)
                        auth_url = f"{base_url}&oauth2_access_token={access_token}"
                        
                        # Log URL construction
                        logger.info(f"🌐 [LINKEDIN ANALYTICS] Base URL: {base_url}")
                        logger.info(f"🌐 [LINKEDIN ANALYTICS] Full URL with token: {base_url}&oauth2_access_token={access_token[:10]}...")
                        
                        logger.info(f"📞 [LINKEDIN ANALYTICS] Making API request...")
                        response = await client.get(auth_url, headers=headers)
                        
                        logger.info(f"📥 [LINKEDIN ANALYTICS] Response status: {response.status_code}")
                        logger.info(f"📥 [LINKEDIN ANALYTICS] Response headers: {dict(response.headers)}")
                        logger.info(f"📥 [LINKEDIN ANALYTICS] Response size: {len(response.content)} bytes")
                        
                        if response.status_code == 200:
                            try:
                                data = response.json()
                                elements = data.get("elements", [])
                                logger.info(f"✅ [LINKEDIN ANALYTICS] Successfully parsed {len(elements)} elements")
                                logger.info(f"📊 [LINKEDIN ANALYTICS] Sample data: {elements[:1] if elements else 'No elements'}")
                                
                                # Merge results from different field chunks
                                previous_count = len(all_results)
                                all_results = self._merge_analytics_results(all_results, elements)
                                new_count = len(all_results)
                                logger.info(f"🔄 [LINKEDIN ANALYTICS] Merged results: {previous_count} -> {new_count} (+{new_count - previous_count})")
                                
                            except json.JSONDecodeError as e:
                                logger.error(f"❌ [LINKEDIN ANALYTICS] Failed to parse JSON response: {str(e)}")
                                logger.error(f"❌ [LINKEDIN ANALYTICS] Raw response: {response.text[:500]}...")
                                raise Exception(f"Invalid JSON response: {str(e)}")
                                
                        else:
                            logger.error(f"❌ [LINKEDIN ANALYTICS] API request failed")
                            logger.error(f"❌ [LINKEDIN ANALYTICS] Status: {response.status_code}")
                            logger.error(f"❌ [LINKEDIN ANALYTICS] Response: {response.text}")
                            
                            # Check for specific error types with enhanced logging
                            if response.status_code == 400:
                                logger.warning(f"⚠️ [LINKEDIN ANALYTICS] Bad request for account {account_urn}")
                                logger.warning(f"⚠️ [LINKEDIN ANALYTICS] This might be due to invalid account URN or field combination")
                                continue
                            elif response.status_code == 401:
                                logger.error(f"🔐 [LINKEDIN ANALYTICS] Authentication failed - token expired or invalid")
                                raise Exception("Authentication failed - invalid access token")
                            elif response.status_code == 403:
                                logger.warning(f"🚫 [LINKEDIN ANALYTICS] Forbidden access to account {account_urn}")
                                logger.warning(f"🚫 [LINKEDIN ANALYTICS] User may not have access to this account")
                                continue
                            elif response.status_code == 429:
                                logger.error(f"⏱️ [LINKEDIN ANALYTICS] Rate limit exceeded")
                                raise Exception("LinkedIn API rate limit exceeded")
                            else:
                                raise Exception(f"API request failed: {response.status_code} - {response.text}")
            
            logger.info(f"📊 [LINKEDIN ANALYTICS] Total raw results collected: {len(all_results)}")
            
            # Transform date ranges
            logger.info(f"🔄 [LINKEDIN ANALYTICS] Transforming date ranges...")
            transformed_results = self._transform_analytics_date_ranges(all_results)
            logger.info(f"✅ [LINKEDIN ANALYTICS] Transformation complete: {len(transformed_results)} final results")
            
            if transformed_results:
                logger.info(f"📊 [LINKEDIN ANALYTICS] Sample transformed result: {transformed_results[0]}")
            
            return transformed_results
            
        except Exception as e:
            logger.error(f"❌ [LINKEDIN ANALYTICS] Error in collect_ad_analytics: {type(e).__name__}: {str(e)}")
            logger.exception(f"❌ [LINKEDIN ANALYTICS] Full traceback:")
            raise
    
    def _prepare_analytics_field_chunks(self, fields: List[str]) -> List[List[str]]:
        """Prepare field chunks for analytics API requests - matches original TypeScript"""
        # Convert fields like original TypeScript
        converted_fields = self._convert_fields_for_api(fields)
        
        # Required fields for proper merging (same as original)
        required_fields = ['dateRange', 'pivotValues']
        
        # Remove duplicates and required fields from user fields
        unique_fields = [f for f in list(set(converted_fields)) if f not in required_fields]
        
        max_custom_fields_per_chunk = self.MAX_FIELDS_PER_REQUEST - len(required_fields)
        field_chunks = []
        
        for i in range(0, len(unique_fields), max_custom_fields_per_chunk):
            custom_fields = unique_fields[i:i + max_custom_fields_per_chunk]
            chunk = required_fields + custom_fields
            field_chunks.append(chunk)
        
        # Handle case when there are no custom fields at all
        if not field_chunks:
            field_chunks.append(required_fields[:])
        
        return field_chunks
    
    def _convert_fields_for_api(self, fields: List[str]) -> List[str]:
        """Convert custom date fields to LinkedIn API compatible fields - matches original TypeScript"""
        api_fields = []
        for field in fields:
            if field in ['dateRangeStart', 'dateRangeEnd']:
                api_fields.append('dateRange')
            else:
                api_fields.append(field)
        
        # Remove duplicates
        return list(set(api_fields))
    
    def _build_analytics_url(
        self,
        account_urn: str,
        start_date: datetime,
        end_date: datetime,
        fields: List[str]
    ) -> str:
        """Build LinkedIn Analytics API URL - Fixed version matching original TypeScript exactly"""
        # Handle URN format - CRITICAL FIX
        if account_urn.startswith('urn:li:sponsoredAccount:'):
            # Already a full URN, use as-is
            full_urn = account_urn
        else:
            # Just an ID, build full URN
            full_urn = f"urn:li:sponsoredAccount:{account_urn}"
            
        # Encode the URN exactly like original TypeScript
        encoded_urn = quote(full_urn, safe='')
        
        # Format fields exactly like original (individual encoding, then join)
        fields_str = ",".join(quote(field, safe='') for field in fields)
        
        # CRITICAL FIX: Format dates exactly like original TypeScript
        # The original uses (date.getMonth() + 1) which is correct since JS months are 0-based
        # Python datetime months are 1-based, so we don't add 1
        start_formatted = f"(year:{start_date.year},month:{start_date.month},day:{start_date.day})"
        end_formatted = f"(year:{end_date.year},month:{end_date.month},day:{end_date.day})"
        
        # Build URL exactly like original TypeScript
        url = (
            f"{self.BASE_URL}adAnalytics?q=statistics"
            f"&dateRange=(start:{start_formatted},end:{end_formatted})"
            f"&pivots=List(CREATIVE,CAMPAIGN,CAMPAIGN_GROUP,ACCOUNT)"
            f"&timeGranularity=DAILY"
            f"&accounts=List({encoded_urn})"
            f"&fields={fields_str}"
        )
        
        return url
    
    def _merge_analytics_results(
        self,
        existing_results: List[Dict[str, Any]],
        new_elements: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Merge results from multiple analytics API requests"""
        if not existing_results:
            return list(new_elements)
        
        merged_results = list(existing_results)
        
        for new_elem in new_elements:
            # Find existing element with same dateRange and pivotValues
            existing_index = -1
            for i, existing in enumerate(merged_results):
                if (json.dumps(existing.get("dateRange"), sort_keys=True) == 
                    json.dumps(new_elem.get("dateRange"), sort_keys=True) and
                    json.dumps(existing.get("pivotValues"), sort_keys=True) == 
                    json.dumps(new_elem.get("pivotValues"), sort_keys=True)):
                    existing_index = i
                    break
            
            if existing_index >= 0:
                # Merge fields
                merged_results[existing_index].update(new_elem)
            else:
                # Add new element
                merged_results.append(new_elem)
        
        return merged_results
    
    def _transform_analytics_date_ranges(
        self,
        analytics_data: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Transform LinkedIn date objects to standard date strings"""
        if not analytics_data:
            return analytics_data
            
        transformed_data = []
        
        for item in analytics_data:
            result = dict(item)
            
            if "dateRange" in result:
                date_range = result["dateRange"]
                
                if "start" in date_range:
                    start = date_range["start"]
                    result["dateRangeStart"] = f"{start['year']}-{start['month']:02d}-{start['day']:02d}"
                
                if "end" in date_range:
                    end = date_range["end"]
                    result["dateRangeEnd"] = f"{end['year']}-{end['month']:02d}-{end['day']:02d}"
                
                # Remove the original dateRange object
                del result["dateRange"]
            
            transformed_data.append(result)
        
        return transformed_data


# LinkedIn Ads field definitions for data collection - UPDATED WITH CORRECT FIELDS
LINKEDIN_ADS_ANALYTICS_FIELDS = [
    "dateRange",
    "pivotValues", 
    "impressions",
    "clicks",
    "costInUsd",
    "costInLocalCurrency",
    "approximateUniqueImpressions",
    "videoViews",
    "videoFirstQuartileCompletions",
    "videoMidpointCompletions", 
    "videoThirdQuartileCompletions",
    "videoCompletions",
    "opens",
    "sends",
    "otherEngagements",
    "textUrlClicks",
    "companyPageClicks",
    "oneClickLeads",
    "oneClickLeadFormOpens",
    "follows",
    "fullScreenPlays",
    "reactions",
    "comments", 
    "shares",
    "viralImpressions",
    "viralClicks",
    "viralReactions",
    "viralComments",
    "viralShares",
    "viralFollows",
    "viralCompanyPageClicks",
    "viralOtherEngagements",
    "actionClicks",
    "adUnitClicks",
    "externalWebsiteConversions",
    "externalWebsitePostClickConversions", 
    "externalWebsitePostViewConversions",
    "landingPageClicks",
    "leadGenerationMailContactInfoShares",
    "leadGenerationMailInterestedClicks"
]

# Basic fields that should work for most accounts
LINKEDIN_ADS_BASIC_FIELDS = [
    "dateRange",
    "pivotValues",
    "impressions", 
    "clicks",
    "costInUsd"
] 