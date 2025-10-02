"""
LinkedIn Ads Connector
Based on base/connectors/src/Sources/LinkedInAds/
"""

from typing import Dict, Any, List, Iterator, Optional
import requests
import time
from datetime import datetime, timedelta
import logging

from app.connectors.base_connector import (
    BaseConnector, 
    ConnectorType, 
    ConnectorConfig,
    ConnectorMessage,
    ConnectorSpec,
    ConnectorState as ConnectorStateData,
    ConnectorStatus
)
from app.connectors.connector_registry import register_connector

logger = logging.getLogger(__name__)


@register_connector(ConnectorType.LINKEDIN_ADS)
class LinkedInAdsConnector(BaseConnector):
    """LinkedIn Ads API connector"""
    
    BASE_URL = "https://api.linkedin.com/rest"
    
    @property
    def connector_type(self) -> ConnectorType:
        return ConnectorType.LINKEDIN_ADS
    
    def check_connection(self) -> Dict[str, Any]:
        """Check if we can connect to LinkedIn Ads API"""
        try:
            access_token = self.config.credentials.get('access_token')
            if not access_token:
                return {"status": "failed", "message": "Access token is required"}
            
            # Test connection by getting user info
            headers = {
                'Authorization': f'Bearer {access_token}',
                'LinkedIn-Version': '202308',
                'X-Restli-Protocol-Version': '2.0.0'
            }
            
            response = requests.get(
                f"{self.BASE_URL}/people/(id:person)",
                headers=headers,
                timeout=30
            )
            
            if response.status_code == 200:
                return {"status": "success", "message": "Connection successful"}
            else:
                return {
                    "status": "failed", 
                    "message": f"API returned status {response.status_code}: {response.text}"
                }
                
        except Exception as e:
            return {"status": "failed", "message": str(e)}
    
    def discover(self) -> ConnectorSpec:
        """Discover available streams"""
        streams = [
            {
                "name": "accounts",
                "json_schema": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "name": {"type": "string"},
                        "type": {"type": "string"},
                        "status": {"type": "string"},
                        "currency": {"type": "string"},
                        "created_time": {"type": "string", "format": "date-time"},
                        "last_modified_time": {"type": "string", "format": "date-time"}
                    }
                },
                "supported_sync_modes": ["full_refresh", "incremental"],
                "source_defined_cursor": True,
                "default_cursor_field": ["last_modified_time"]
            },
            {
                "name": "campaigns",
                "json_schema": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "account_id": {"type": "string"},
                        "name": {"type": "string"},
                        "status": {"type": "string"},
                        "type": {"type": "string"},
                        "cost_type": {"type": "string"},
                        "daily_budget": {"type": "number"},
                        "unit_cost": {"type": "number"},
                        "created_time": {"type": "string", "format": "date-time"},
                        "last_modified_time": {"type": "string", "format": "date-time"}
                    }
                },
                "supported_sync_modes": ["full_refresh", "incremental"],
                "source_defined_cursor": True,
                "default_cursor_field": ["last_modified_time"]
            },
            {
                "name": "ad_analytics",
                "json_schema": {
                    "type": "object",
                    "properties": {
                        "campaign_id": {"type": "string"},
                        "creative_id": {"type": "string"},
                        "date_range": {
                            "type": "object",
                            "properties": {
                                "start": {"type": "string", "format": "date"},
                                "end": {"type": "string", "format": "date"}
                            }
                        },
                        "impressions": {"type": "integer"},
                        "clicks": {"type": "integer"},
                        "cost_in_local_currency": {"type": "number"},
                        "external_website_conversions": {"type": "integer"}
                    }
                },
                "supported_sync_modes": ["full_refresh", "incremental"],
                "source_defined_cursor": True,
                "default_cursor_field": ["date_range", "start"]
            }
        ]
        
        connection_specification = {
            "type": "object",
            "properties": {
                "access_token": {
                    "type": "string",
                    "title": "Access Token",
                    "description": "LinkedIn Ads API access token",
                    "airbyte_secret": True
                },
                "start_date": {
                    "type": "string",
                    "title": "Start Date",
                    "description": "Start date for data sync (YYYY-MM-DD)",
                    "format": "date",
                    "default": "2023-01-01"
                },
                "account_ids": {
                    "type": "array",
                    "title": "Account IDs",
                    "description": "LinkedIn Ads account IDs to sync",
                    "items": {"type": "string"}
                }
            },
            "required": ["access_token"]
        }
        
        return ConnectorSpec(
            streams=streams,
            connection_specification=connection_specification,
            supported_sync_modes=["full_refresh", "incremental"]
        )
    
    def read(self, 
             streams: List[str] = None, 
             state: Dict[str, ConnectorStateData] = None) -> Iterator[ConnectorMessage]:
        """Read data from LinkedIn Ads API"""
        try:
            self.set_status(ConnectorStatus.RUNNING)
            
            # Get configuration
            access_token = self.config.credentials.get('access_token')
            start_date = self.config.config.get('start_date', '2023-01-01')
            account_ids = self.config.config.get('account_ids', [])
            
            if not access_token:
                raise ValueError("Access token is required")
            
            # Set up headers
            headers = {
                'Authorization': f'Bearer {access_token}',
                'LinkedIn-Version': '202308',
                'X-Restli-Protocol-Version': '2.0.0'
            }
            
            # Determine which streams to sync
            available_streams = ["accounts", "campaigns", "ad_analytics"]
            streams_to_sync = streams if streams else available_streams
            
            yield self.emit_log("INFO", f"Starting sync for streams: {streams_to_sync}")
            
            # Sync each stream
            for stream_name in streams_to_sync:
                if stream_name not in available_streams:
                    yield self.emit_log("WARNING", f"Unknown stream: {stream_name}")
                    continue
                
                yield self.emit_log("INFO", f"Syncing stream: {stream_name}")
                
                # Get state for this stream
                stream_state = state.get(stream_name, {}) if state else {}
                
                # Sync the stream
                if stream_name == "accounts":
                    yield from self._sync_accounts(headers, stream_state, account_ids)
                elif stream_name == "campaigns":
                    yield from self._sync_campaigns(headers, stream_state, account_ids)
                elif stream_name == "ad_analytics":
                    yield from self._sync_ad_analytics(headers, stream_state, account_ids, start_date)
            
            yield self.emit_log("INFO", "Sync completed successfully")
            self.set_status(ConnectorStatus.SUCCESS)
            
        except Exception as e:
            error_msg = f"Sync failed: {str(e)}"
            yield self.emit_log("ERROR", error_msg)
            self.set_status(ConnectorStatus.FAILED)
            raise
    
    def _sync_accounts(self, headers: Dict[str, str], state: Dict[str, Any], account_ids: List[str]) -> Iterator[ConnectorMessage]:
        """Sync LinkedIn Ads accounts"""
        try:
            # If specific account IDs are provided, use them; otherwise get all accessible accounts
            if account_ids:
                for account_id in account_ids:
                    account_data = self._get_account(headers, account_id)
                    if account_data:
                        yield self.emit_record("accounts", account_data)
            else:
                # Get all accessible accounts
                url = f"{self.BASE_URL}/adAccounts"
                params = {"q": "search"}
                
                response = requests.get(url, headers=headers, params=params, timeout=30)
                response.raise_for_status()
                
                data = response.json()
                accounts = data.get('elements', [])
                
                for account in accounts:
                    # Transform account data
                    account_data = {
                        "id": str(account.get('id', '')),
                        "name": account.get('name', ''),
                        "type": account.get('type', ''),
                        "status": account.get('status', ''),
                        "currency": account.get('currency', ''),
                        "created_time": account.get('createdTime'),
                        "last_modified_time": account.get('lastModifiedTime')
                    }
                    
                    yield self.emit_record("accounts", account_data)
            
            # Emit state (for accounts, we don't need incremental state)
            yield self.emit_state("accounts", {"last_sync": datetime.utcnow().isoformat()})
            
        except Exception as e:
            yield self.emit_log("ERROR", f"Failed to sync accounts: {str(e)}")
            raise
    
    def _sync_campaigns(self, headers: Dict[str, str], state: Dict[str, Any], account_ids: List[str]) -> Iterator[ConnectorMessage]:
        """Sync LinkedIn Ads campaigns"""
        try:
            last_modified_time = state.get('last_modified_time')
            
            for account_id in account_ids or []:
                url = f"{self.BASE_URL}/adCampaigns"
                params = {
                    "q": "search",
                    "search.account.values[0]": f"urn:li:sponsoredAccount:{account_id}"
                }
                
                if last_modified_time:
                    params["search.lastModifiedTime.start"] = last_modified_time
                
                response = requests.get(url, headers=headers, params=params, timeout=30)
                response.raise_for_status()
                
                data = response.json()
                campaigns = data.get('elements', [])
                
                latest_modified_time = last_modified_time
                
                for campaign in campaigns:
                    # Transform campaign data
                    campaign_data = {
                        "id": str(campaign.get('id', '')),
                        "account_id": account_id,
                        "name": campaign.get('name', ''),
                        "status": campaign.get('status', ''),
                        "type": campaign.get('type', ''),
                        "cost_type": campaign.get('costType', ''),
                        "daily_budget": campaign.get('dailyBudget', {}).get('amount'),
                        "unit_cost": campaign.get('unitCost', {}).get('amount'),
                        "created_time": campaign.get('createdTime'),
                        "last_modified_time": campaign.get('lastModifiedTime')
                    }
                    
                    yield self.emit_record("campaigns", campaign_data)
                    
                    # Track latest modified time for incremental sync
                    if campaign_data['last_modified_time'] and (
                        not latest_modified_time or 
                        campaign_data['last_modified_time'] > latest_modified_time
                    ):
                        latest_modified_time = campaign_data['last_modified_time']
                
                # Emit updated state
                yield self.emit_state("campaigns", {"last_modified_time": latest_modified_time})
                
        except Exception as e:
            yield self.emit_log("ERROR", f"Failed to sync campaigns: {str(e)}")
            raise
    
    def _sync_ad_analytics(self, headers: Dict[str, str], state: Dict[str, Any], account_ids: List[str], start_date: str) -> Iterator[ConnectorMessage]:
        """Sync LinkedIn Ads analytics data"""
        try:
            # Determine date range
            last_sync_date = state.get('last_sync_date', start_date)
            end_date = datetime.now().strftime('%Y-%m-%d')
            
            for account_id in account_ids or []:
                url = f"{self.BASE_URL}/adAnalytics"
                params = {
                    "q": "analytics",
                    "pivot": "CAMPAIGN",
                    "dateRange.start.day": last_sync_date.split('-')[2],
                    "dateRange.start.month": last_sync_date.split('-')[1],
                    "dateRange.start.year": last_sync_date.split('-')[0],
                    "dateRange.end.day": end_date.split('-')[2],
                    "dateRange.end.month": end_date.split('-')[1],
                    "dateRange.end.year": end_date.split('-')[0],
                    "accounts[0]": f"urn:li:sponsoredAccount:{account_id}",
                    "fields": "impressions,clicks,costInLocalCurrency,externalWebsiteConversions"
                }
                
                response = requests.get(url, headers=headers, params=params, timeout=30)
                response.raise_for_status()
                
                data = response.json()
                analytics = data.get('elements', [])
                
                for analytic in analytics:
                    # Transform analytics data
                    analytics_data = {
                        "campaign_id": analytic.get('pivotValue', '').replace('urn:li:sponsoredCampaign:', ''),
                        "creative_id": analytic.get('creativeId', ''),
                        "date_range": {
                            "start": last_sync_date,
                            "end": end_date
                        },
                        "impressions": analytic.get('impressions', 0),
                        "clicks": analytic.get('clicks', 0),
                        "cost_in_local_currency": analytic.get('costInLocalCurrency', 0),
                        "external_website_conversions": analytic.get('externalWebsiteConversions', 0)
                    }
                    
                    yield self.emit_record("ad_analytics", analytics_data)
                
                # Emit updated state
                yield self.emit_state("ad_analytics", {"last_sync_date": end_date})
                
        except Exception as e:
            yield self.emit_log("ERROR", f"Failed to sync ad analytics: {str(e)}")
            raise
    
    def _get_account(self, headers: Dict[str, str], account_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific LinkedIn Ads account"""
        try:
            url = f"{self.BASE_URL}/adAccounts/{account_id}"
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            
            account = response.json()
            return {
                "id": str(account.get('id', '')),
                "name": account.get('name', ''),
                "type": account.get('type', ''),
                "status": account.get('status', ''),
                "currency": account.get('currency', ''),
                "created_time": account.get('createdTime'),
                "last_modified_time": account.get('lastModifiedTime')
            }
            
        except Exception as e:
            logger.error(f"Failed to get account {account_id}: {e}")
            return None
    
    def _validate_connector_config(self) -> Dict[str, Any]:
        """Validate LinkedIn Ads specific configuration"""
        access_token = self.config.credentials.get('access_token')
        if not access_token:
            return {"valid": False, "message": "Access token is required"}
        
        start_date = self.config.config.get('start_date')
        if start_date:
            try:
                datetime.strptime(start_date, '%Y-%m-%d')
            except ValueError:
                return {"valid": False, "message": "Invalid start_date format. Use YYYY-MM-DD"}
        
        return {"valid": True, "message": "Configuration is valid"}
