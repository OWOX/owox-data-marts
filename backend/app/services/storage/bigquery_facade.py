"""
BigQuery Storage Facade
Based on base/backend/src/data-marts/data-storage-types/facades/bigquery.facade.ts
"""

from typing import Dict, Any, List, Optional, Union
import json
import logging
from datetime import datetime

try:
    from google.cloud import bigquery
    from google.oauth2 import service_account
    BIGQUERY_AVAILABLE = True
except ImportError:
    BIGQUERY_AVAILABLE = False
    bigquery = None
    service_account = None

logger = logging.getLogger(__name__)


class BigQueryFacade:
    """Facade for BigQuery operations"""
    
    def __init__(self, config: Dict[str, Any], credentials: Dict[str, Any]):
        if not BIGQUERY_AVAILABLE:
            raise ImportError("google-cloud-bigquery is required for BigQuery operations")
        
        self.config = config
        self.credentials = credentials
        self.project_id = config.get('project_id')
        self.dataset_id = config.get('dataset_id')
        self.location = config.get('location', 'US')
        
        # Initialize BigQuery client
        self.client = self._create_client()
        
    def _create_client(self) -> bigquery.Client:
        """Create BigQuery client with service account credentials"""
        try:
            # Handle service account key
            service_account_key = self.credentials.get('service_account_key')
            if isinstance(service_account_key, str):
                service_account_key = json.loads(service_account_key)
            
            # Create credentials from service account info
            credentials = service_account.Credentials.from_service_account_info(
                service_account_key
            )
            
            # Create BigQuery client
            client = bigquery.Client(
                project=self.project_id,
                credentials=credentials,
                location=self.location
            )
            
            return client
            
        except Exception as e:
            logger.error(f"Failed to create BigQuery client: {e}")
            raise
    
    def test_connection(self) -> Dict[str, Any]:
        """Test connection to BigQuery"""
        try:
            # Try to get dataset info
            dataset_ref = self.client.dataset(self.dataset_id, project=self.project_id)
            dataset = self.client.get_dataset(dataset_ref)
            
            return {
                "status": "success",
                "message": "Connection successful",
                "details": {
                    "project_id": self.project_id,
                    "dataset_id": self.dataset_id,
                    "location": dataset.location,
                    "created": dataset.created.isoformat() if dataset.created else None
                }
            }
            
        except Exception as e:
            return {
                "status": "failed",
                "message": f"Connection failed: {str(e)}"
            }
    
    def create_table(self, table_name: str, schema: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Create a table in BigQuery"""
        try:
            # Convert schema to BigQuery schema
            bq_schema = []
            for field in schema:
                field_type = self._convert_field_type(field.get('type', 'STRING'))
                mode = field.get('mode', 'NULLABLE')
                
                bq_field = bigquery.SchemaField(
                    name=field['name'],
                    field_type=field_type,
                    mode=mode,
                    description=field.get('description')
                )
                bq_schema.append(bq_field)
            
            # Create table reference
            table_ref = self.client.dataset(self.dataset_id).table(table_name)
            table = bigquery.Table(table_ref, schema=bq_schema)
            
            # Create the table
            table = self.client.create_table(table)
            
            return {
                "status": "success",
                "message": f"Table {table_name} created successfully",
                "table_id": f"{self.project_id}.{self.dataset_id}.{table_name}"
            }
            
        except Exception as e:
            return {
                "status": "failed",
                "message": f"Failed to create table: {str(e)}"
            }
    
    def insert_data(self, table_name: str, data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Insert data into BigQuery table"""
        try:
            table_ref = self.client.dataset(self.dataset_id).table(table_name)
            table = self.client.get_table(table_ref)
            
            # Insert rows
            errors = self.client.insert_rows_json(table, data)
            
            if errors:
                return {
                    "status": "failed",
                    "message": "Failed to insert some rows",
                    "errors": errors
                }
            else:
                return {
                    "status": "success",
                    "message": f"Inserted {len(data)} rows successfully",
                    "rows_inserted": len(data)
                }
                
        except Exception as e:
            return {
                "status": "failed",
                "message": f"Failed to insert data: {str(e)}"
            }
    
    def execute_query(self, query: str, parameters: Dict[str, Any] = None) -> Dict[str, Any]:
        """Execute a SQL query in BigQuery"""
        try:
            # Configure query job
            job_config = bigquery.QueryJobConfig()
            
            # Add query parameters if provided
            if parameters:
                query_parameters = []
                for key, value in parameters.items():
                    param_type = self._get_parameter_type(value)
                    query_parameters.append(
                        bigquery.ScalarQueryParameter(key, param_type, value)
                    )
                job_config.query_parameters = query_parameters
            
            # Execute query
            query_job = self.client.query(query, job_config=job_config)
            results = query_job.result()
            
            # Convert results to list of dictionaries
            rows = []
            for row in results:
                rows.append(dict(row))
            
            return {
                "status": "success",
                "message": "Query executed successfully",
                "rows": rows,
                "total_rows": results.total_rows,
                "bytes_processed": query_job.total_bytes_processed,
                "job_id": query_job.job_id
            }
            
        except Exception as e:
            return {
                "status": "failed",
                "message": f"Query execution failed: {str(e)}"
            }
    
    def get_table_schema(self, table_name: str) -> Dict[str, Any]:
        """Get schema of a BigQuery table"""
        try:
            table_ref = self.client.dataset(self.dataset_id).table(table_name)
            table = self.client.get_table(table_ref)
            
            # Convert schema to dictionary format
            schema = []
            for field in table.schema:
                schema.append({
                    "name": field.name,
                    "type": field.field_type,
                    "mode": field.mode,
                    "description": field.description
                })
            
            return {
                "status": "success",
                "schema": schema,
                "num_rows": table.num_rows,
                "num_bytes": table.num_bytes,
                "created": table.created.isoformat() if table.created else None,
                "modified": table.modified.isoformat() if table.modified else None
            }
            
        except Exception as e:
            return {
                "status": "failed",
                "message": f"Failed to get table schema: {str(e)}"
            }
    
    def list_tables(self) -> Dict[str, Any]:
        """List all tables in the dataset"""
        try:
            dataset_ref = self.client.dataset(self.dataset_id)
            tables = list(self.client.list_tables(dataset_ref))
            
            table_list = []
            for table in tables:
                table_list.append({
                    "table_id": table.table_id,
                    "full_table_id": f"{table.project}.{table.dataset_id}.{table.table_id}",
                    "table_type": table.table_type,
                    "created": table.created.isoformat() if table.created else None
                })
            
            return {
                "status": "success",
                "tables": table_list,
                "count": len(table_list)
            }
            
        except Exception as e:
            return {
                "status": "failed",
                "message": f"Failed to list tables: {str(e)}"
            }
    
    def delete_table(self, table_name: str) -> Dict[str, Any]:
        """Delete a table from BigQuery"""
        try:
            table_ref = self.client.dataset(self.dataset_id).table(table_name)
            self.client.delete_table(table_ref)
            
            return {
                "status": "success",
                "message": f"Table {table_name} deleted successfully"
            }
            
        except Exception as e:
            return {
                "status": "failed",
                "message": f"Failed to delete table: {str(e)}"
            }
    
    def _convert_field_type(self, field_type: str) -> str:
        """Convert generic field type to BigQuery field type"""
        type_mapping = {
            'string': 'STRING',
            'integer': 'INTEGER',
            'float': 'FLOAT',
            'boolean': 'BOOLEAN',
            'timestamp': 'TIMESTAMP',
            'date': 'DATE',
            'datetime': 'DATETIME',
            'json': 'JSON',
            'array': 'REPEATED'
        }
        
        return type_mapping.get(field_type.lower(), 'STRING')
    
    def _get_parameter_type(self, value: Any) -> str:
        """Get BigQuery parameter type from Python value"""
        if isinstance(value, str):
            return 'STRING'
        elif isinstance(value, int):
            return 'INT64'
        elif isinstance(value, float):
            return 'FLOAT64'
        elif isinstance(value, bool):
            return 'BOOL'
        elif isinstance(value, datetime):
            return 'TIMESTAMP'
        else:
            return 'STRING'
    
    def dry_run_query(self, query: str) -> Dict[str, Any]:
        """Perform a dry run of a query to validate and estimate costs"""
        try:
            job_config = bigquery.QueryJobConfig(dry_run=True, use_query_cache=False)
            query_job = self.client.query(query, job_config=job_config)
            
            return {
                "status": "success",
                "message": "Query is valid",
                "bytes_processed": query_job.total_bytes_processed,
                "estimated_cost_usd": self._estimate_query_cost(query_job.total_bytes_processed)
            }
            
        except Exception as e:
            return {
                "status": "failed",
                "message": f"Query validation failed: {str(e)}"
            }
    
    def _estimate_query_cost(self, bytes_processed: int) -> float:
        """Estimate query cost based on bytes processed"""
        # BigQuery pricing: $5 per TB processed (as of 2023)
        tb_processed = bytes_processed / (1024 ** 4)  # Convert bytes to TB
        return tb_processed * 5.0
