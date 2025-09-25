"""
Google Services Integration
Handles Google Sheets, BigQuery, and Analytics integrations
"""
import json
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
from google.oauth2.credentials import Credentials
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from google.auth.transport.requests import Request
from cryptography.fernet import Fernet

from app.core.config import settings

logger = logging.getLogger(__name__)


class GoogleSheetsService:
    """Service for Google Sheets integration"""
    
    SCOPES = [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file'
    ]
    
    def __init__(self):
        self.encryption_key = settings.ENCRYPTION_KEY
        if self.encryption_key:
            self.fernet = Fernet(self.encryption_key.encode())
    
    def decrypt_credentials(self, encrypted_credentials: str) -> Dict[str, Any]:
        """Decrypt stored credentials"""
        if not self.fernet:
            raise ValueError("Encryption key not configured")
        
        decrypted_data = self.fernet.decrypt(encrypted_credentials.encode())
        return json.loads(decrypted_data.decode())
    
    def _get_service(self, credentials_data: Dict[str, Any]):
        """Create Google Sheets service with credentials"""
        try:
            if 'service_account_key' in credentials_data:
                # Service Account authentication
                service_account_info = credentials_data['service_account_key']
                credentials = service_account.Credentials.from_service_account_info(
                    service_account_info, scopes=self.SCOPES
                )
            else:
                # OAuth2 authentication
                credentials = Credentials.from_authorized_user_info(
                    credentials_data, self.SCOPES
                )
                
                # Refresh if needed
                if credentials.expired and credentials.refresh_token:
                    credentials.refresh(Request())
            
            return build('sheets', 'v4', credentials=credentials)
        
        except Exception as e:
            logger.error(f"Error creating Google Sheets service: {str(e)}")
            raise
    
    async def validate_credentials(self, credentials: Dict[str, Any]) -> Dict[str, Any]:
        """Validate Google Sheets credentials"""
        try:
            service = self._get_service(credentials)
            
            # Test with a simple API call
            result = service.spreadsheets().create(body={
                'properties': {'title': 'OWOX Test Sheet'}
            }).execute()
            
            spreadsheet_id = result['spreadsheetId']
            
            # Delete the test spreadsheet
            drive_service = build('drive', 'v3', credentials=service._http.credentials)
            drive_service.files().delete(fileId=spreadsheet_id).execute()
            
            return {"valid": True, "account_info": {"service": "Google Sheets"}}
            
        except Exception as e:
            logger.error(f"Google Sheets credential validation error: {str(e)}")
            return {"valid": False, "error": str(e)}
    
    async def create_spreadsheet(
        self,
        credentials: Dict[str, Any],
        title: str,
        headers: List[str]
    ) -> Dict[str, Any]:
        """Create a new Google Spreadsheet with headers"""
        try:
            service = self._get_service(credentials)
            
            # Create spreadsheet
            spreadsheet_body = {
                'properties': {'title': title}
            }
            
            result = service.spreadsheets().create(body=spreadsheet_body).execute()
            spreadsheet_id = result['spreadsheetId']
            
            # Add headers
            if headers:
                range_name = 'Sheet1!A1'
                values = [headers]
                
                service.spreadsheets().values().update(
                    spreadsheetId=spreadsheet_id,
                    range=range_name,
                    valueInputOption='RAW',
                    body={'values': values}
                ).execute()
            
            return {
                'spreadsheet_id': spreadsheet_id,
                'spreadsheet_url': f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}",
                'title': title
            }
            
        except Exception as e:
            logger.error(f"Error creating Google Spreadsheet: {str(e)}")
            raise
    
    async def append_data(
        self,
        credentials: Dict[str, Any],
        spreadsheet_id: str,
        data: List[List[Any]],
        sheet_name: str = 'Sheet1'
    ) -> Dict[str, Any]:
        """Append data to Google Spreadsheet"""
        try:
            service = self._get_service(credentials)
            
            range_name = f'{sheet_name}!A:Z'
            
            result = service.spreadsheets().values().append(
                spreadsheetId=spreadsheet_id,
                range=range_name,
                valueInputOption='RAW',
                insertDataOption='INSERT_ROWS',
                body={'values': data}
            ).execute()
            
            return {
                'updated_rows': result.get('updates', {}).get('updatedRows', 0),
                'updated_columns': result.get('updates', {}).get('updatedColumns', 0)
            }
            
        except Exception as e:
            logger.error(f"Error appending data to Google Spreadsheet: {str(e)}")
            raise
    
    async def clear_sheet(
        self,
        credentials: Dict[str, Any],
        spreadsheet_id: str,
        sheet_name: str = 'Sheet1'
    ) -> bool:
        """Clear all data from a sheet"""
        try:
            service = self._get_service(credentials)
            
            range_name = f'{sheet_name}!A:Z'
            
            service.spreadsheets().values().clear(
                spreadsheetId=spreadsheet_id,
                range=range_name
            ).execute()
            
            return True
            
        except Exception as e:
            logger.error(f"Error clearing Google Sheet: {str(e)}")
            raise


class GoogleBigQueryService:
    """Service for Google BigQuery integration"""
    
    SCOPES = [
        'https://www.googleapis.com/auth/bigquery',
        'https://www.googleapis.com/auth/cloud-platform'
    ]
    
    def __init__(self):
        self.encryption_key = settings.ENCRYPTION_KEY
        if self.encryption_key:
            self.fernet = Fernet(self.encryption_key.encode())
    
    def decrypt_credentials(self, encrypted_credentials: str) -> Dict[str, Any]:
        """Decrypt stored credentials"""
        if not self.fernet:
            raise ValueError("Encryption key not configured")
        
        decrypted_data = self.fernet.decrypt(encrypted_credentials.encode())
        return json.loads(decrypted_data.decode())
    
    def _get_client(self, credentials_data: Dict[str, Any]):
        """Create BigQuery client with credentials"""
        try:
            from google.cloud import bigquery
            
            if 'service_account_key' in credentials_data:
                # Service Account authentication
                service_account_info = credentials_data['service_account_key']
                credentials = service_account.Credentials.from_service_account_info(
                    service_account_info, scopes=self.SCOPES
                )
                project_id = service_account_info.get('project_id')
            else:
                # OAuth2 authentication
                credentials = Credentials.from_authorized_user_info(
                    credentials_data, self.SCOPES
                )
                project_id = credentials_data.get('project_id')
            
            return bigquery.Client(credentials=credentials, project=project_id)
        
        except Exception as e:
            logger.error(f"Error creating BigQuery client: {str(e)}")
            raise
    
    async def validate_credentials(self, credentials: Dict[str, Any]) -> Dict[str, Any]:
        """Validate BigQuery credentials"""
        try:
            client = self._get_client(credentials)
            
            # Test with a simple query
            query = "SELECT 1 as test_column"
            query_job = client.query(query)
            results = query_job.result()
            
            return {
                "valid": True,
                "account_info": {
                    "project_id": client.project,
                    "service": "Google BigQuery"
                }
            }
            
        except Exception as e:
            logger.error(f"BigQuery credential validation error: {str(e)}")
            return {"valid": False, "error": str(e)}
    
    async def create_dataset(
        self,
        credentials: Dict[str, Any],
        dataset_id: str,
        description: str = None
    ) -> Dict[str, Any]:
        """Create a BigQuery dataset"""
        try:
            from google.cloud import bigquery
            
            client = self._get_client(credentials)
            
            dataset_ref = client.dataset(dataset_id)
            dataset = bigquery.Dataset(dataset_ref)
            
            if description:
                dataset.description = description
            
            dataset = client.create_dataset(dataset, exists_ok=True)
            
            return {
                'dataset_id': dataset.dataset_id,
                'project_id': dataset.project,
                'location': dataset.location
            }
            
        except Exception as e:
            logger.error(f"Error creating BigQuery dataset: {str(e)}")
            raise
    
    async def create_table(
        self,
        credentials: Dict[str, Any],
        dataset_id: str,
        table_id: str,
        schema: List[Dict[str, str]]
    ) -> Dict[str, Any]:
        """Create a BigQuery table with schema"""
        try:
            from google.cloud import bigquery
            
            client = self._get_client(credentials)
            
            table_ref = client.dataset(dataset_id).table(table_id)
            
            # Convert schema to BigQuery format
            bq_schema = []
            for field in schema:
                bq_schema.append(bigquery.SchemaField(
                    field['name'],
                    field['type'],
                    mode=field.get('mode', 'NULLABLE')
                ))
            
            table = bigquery.Table(table_ref, schema=bq_schema)
            table = client.create_table(table, exists_ok=True)
            
            return {
                'table_id': table.table_id,
                'dataset_id': table.dataset_id,
                'project_id': table.project,
                'schema': [{'name': field.name, 'type': field.field_type} for field in table.schema]
            }
            
        except Exception as e:
            logger.error(f"Error creating BigQuery table: {str(e)}")
            raise
    
    async def insert_data(
        self,
        credentials: Dict[str, Any],
        dataset_id: str,
        table_id: str,
        data: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Insert data into BigQuery table"""
        try:
            client = self._get_client(credentials)
            
            table_ref = client.dataset(dataset_id).table(table_id)
            table = client.get_table(table_ref)
            
            errors = client.insert_rows_json(table, data)
            
            if errors:
                raise Exception(f"BigQuery insert errors: {errors}")
            
            return {
                'inserted_rows': len(data),
                'table_id': table_id,
                'dataset_id': dataset_id
            }
            
        except Exception as e:
            logger.error(f"Error inserting data to BigQuery: {str(e)}")
            raise


class GoogleAnalyticsService:
    """Service for Google Analytics integration"""
    
    SCOPES = [
        'https://www.googleapis.com/auth/analytics.readonly'
    ]
    
    def __init__(self):
        self.encryption_key = settings.ENCRYPTION_KEY
        if self.encryption_key:
            self.fernet = Fernet(self.encryption_key.encode())
    
    def decrypt_credentials(self, encrypted_credentials: str) -> Dict[str, Any]:
        """Decrypt stored credentials"""
        if not self.fernet:
            raise ValueError("Encryption key not configured")
        
        decrypted_data = self.fernet.decrypt(encrypted_credentials.encode())
        return json.loads(decrypted_data.decode())
    
    def _get_service(self, credentials_data: Dict[str, Any]):
        """Create Google Analytics service with credentials"""
        try:
            if 'service_account_key' in credentials_data:
                # Service Account authentication
                service_account_info = credentials_data['service_account_key']
                credentials = service_account.Credentials.from_service_account_info(
                    service_account_info, scopes=self.SCOPES
                )
            else:
                # OAuth2 authentication
                credentials = Credentials.from_authorized_user_info(
                    credentials_data, self.SCOPES
                )
                
                # Refresh if needed
                if credentials.expired and credentials.refresh_token:
                    credentials.refresh(Request())
            
            return build('analyticsreporting', 'v4', credentials=credentials)
        
        except Exception as e:
            logger.error(f"Error creating Google Analytics service: {str(e)}")
            raise
    
    async def validate_credentials(self, credentials: Dict[str, Any]) -> Dict[str, Any]:
        """Validate Google Analytics credentials"""
        try:
            service = self._get_service(credentials)
            
            # Test with account summary request
            analytics = build('analytics', 'v3', credentials=service._http.credentials)
            accounts = analytics.management().accounts().list().execute()
            
            return {
                "valid": True,
                "account_info": {
                    "service": "Google Analytics",
                    "accounts_count": len(accounts.get('items', []))
                }
            }
            
        except Exception as e:
            logger.error(f"Google Analytics credential validation error: {str(e)}")
            return {"valid": False, "error": str(e)}
    
    async def get_reports(
        self,
        credentials: Dict[str, Any],
        view_id: str,
        start_date: str,
        end_date: str,
        metrics: List[str],
        dimensions: List[str] = None
    ) -> List[Dict[str, Any]]:
        """Get Google Analytics reports"""
        try:
            service = self._get_service(credentials)
            
            # Build report request
            report_request = {
                'viewId': view_id,
                'dateRanges': [{'startDate': start_date, 'endDate': end_date}],
                'metrics': [{'expression': metric} for metric in metrics]
            }
            
            if dimensions:
                report_request['dimensions'] = [{'name': dim} for dim in dimensions]
            
            # Execute request
            response = service.reports().batchGet(
                body={'reportRequests': [report_request]}
            ).execute()
            
            # Parse response
            reports = []
            for report in response.get('reports', []):
                headers = []
                
                # Get dimension headers
                if 'dimensions' in report_request:
                    for dim_header in report.get('columnHeader', {}).get('dimensions', []):
                        headers.append(dim_header)
                
                # Get metric headers
                for metric_header in report.get('columnHeader', {}).get('metricHeader', {}).get('metricHeaderEntries', []):
                    headers.append(metric_header.get('name'))
                
                # Get data rows
                for row in report.get('data', {}).get('rows', []):
                    row_data = {}
                    
                    # Add dimension values
                    if 'dimensions' in row:
                        for i, dim_value in enumerate(row['dimensions']):
                            if i < len([h for h in headers if not h.startswith('ga:metric')]):
                                row_data[headers[i]] = dim_value
                    
                    # Add metric values
                    metric_start_index = len(row.get('dimensions', []))
                    for i, metric_value in enumerate(row.get('metrics', [{}])[0].get('values', [])):
                        header_index = metric_start_index + i
                        if header_index < len(headers):
                            row_data[headers[header_index]] = metric_value
                    
                    reports.append(row_data)
            
            return reports
            
        except Exception as e:
            logger.error(f"Error getting Google Analytics reports: {str(e)}")
            raise
