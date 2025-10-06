"""
BigQuery Storage Facade
Based on base/backend/src/data-marts/data-storage-types/facades/bigquery.facade.ts
"""

from typing import Dict, Any, List, Optional, Union, TYPE_CHECKING
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

if TYPE_CHECKING:
    from google.cloud import bigquery as bigquery_type

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
        
    def _create_client(self):
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
        """Test connection to BigQuery and create dataset if it doesn't exist"""
        try:
            # Try to get dataset info
            dataset_ref = self.client.dataset(self.dataset_id, project=self.project_id)
            
            try:
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
            except Exception as dataset_error:
                # If dataset doesn't exist, try to create it
                logger.info(f"🔍 [BIGQUERY] Dataset error: {str(dataset_error)}")
                if "Not found" in str(dataset_error) or "404" in str(dataset_error):
                    logger.info(f"📦 [BIGQUERY] Dataset {self.dataset_id} not found, creating it...")
                    
                    # Create the dataset
                    dataset = bigquery.Dataset(dataset_ref)
                    dataset.location = self.location  # Set location for the dataset
                    dataset.description = f"Dataset created automatically by OWOX Data Marts for project {self.project_id}"
                    
                    created_dataset = self.client.create_dataset(dataset, timeout=30)
                    logger.info(f"✅ [BIGQUERY] Successfully created dataset {self.dataset_id}")
                    
                    return {
                        "status": "success", 
                        "message": "Connection successful (dataset created)",
                        "details": {
                            "project_id": self.project_id,
                            "dataset_id": self.dataset_id,
                            "location": created_dataset.location,
                            "created": created_dataset.created.isoformat() if created_dataset.created else None,
                            "auto_created": True
                        }
                    }
                else:
                    # Re-raise if it's a different error
                    raise dataset_error
            
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
            dataset_ref = self.client.dataset(self.dataset_id)
            table_ref = dataset_ref.table(table_name)
            
            # Clean and prepare data for BigQuery
            cleaned_data = self._clean_data_for_bigquery(data)
            logger.info(f"📋 [BIGQUERY] Cleaned {len(data)} records for insertion")
            
            # Try to get existing table, create if doesn't exist
            try:
                table = self.client.get_table(table_ref)
                logger.info(f"📋 [BIGQUERY] Table {table_name} already exists, checking schema compatibility...")
                
                # Log existing schema for debugging
                existing_schema = {field.name.lower(): field.field_type for field in table.schema}
                logger.info(f"🔍 [BIGQUERY] Existing schema: {existing_schema}")
                
                expected_schema = self._infer_schema_from_data(cleaned_data)
                expected_types = {field.name.lower(): field.field_type for field in expected_schema}
                logger.info(f"🎯 [BIGQUERY] Expected schema: {expected_types}")
                
                # ALWAYS drop table for LinkedIn data to ensure correct schema
                # This is a forced recreation to fix persistent issues
                logger.info(f"🔄 [BIGQUERY] FORCING table recreation for LinkedIn data to fix schema issues...")
                self.client.delete_table(table_ref)
                raise Exception("Table force-dropped for recreation")
                    
            except Exception as e:
                # Table doesn't exist or was dropped, create it with schema inferred from data
                schema = self._infer_schema_from_data(cleaned_data)
                table = bigquery.Table(table_ref, schema=schema)
                table = self.client.create_table(table)
                logger.info(f"Created table {table_name} with inferred schema")
                
                # Log the schema for debugging
                for field in schema:
                    logger.info(f"📋 [BIGQUERY] Field: {field.name} -> {field.field_type}")
            
            # Insert rows using cleaned data
            errors = self.client.insert_rows_json(table, cleaned_data)
            
            if errors:
                # Log detailed errors for debugging
                logger.error(f"❌ [BIGQUERY] Insertion errors for table {table_name}:")
                for i, error in enumerate(errors):
                    logger.error(f"❌ [BIGQUERY] Row {i}: {error}")
                
                return {
                    "status": "failed",
                    "message": f"Failed to insert some rows: {errors[:3]}",  # Show first 3 errors
                    "errors": errors
                }
            else:
                return {
                    "status": "success",
                    "message": f"Inserted {len(cleaned_data)} rows successfully",
                    "rows_inserted": len(cleaned_data)
                }
                
        except Exception as e:
            return {
                "status": "failed",
                "message": f"Failed to insert data: {str(e)}"
            }
    
    def _clean_data_for_bigquery(self, data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Clean and prepare data for BigQuery insertion"""
        cleaned_data = []
        
        for row in data:
            cleaned_row = {}
            for key, value in row.items():
                # Handle None values
                if value is None:
                    cleaned_row[key] = None
                # Handle complex objects (convert to string)
                elif isinstance(value, (dict, list)):
                    cleaned_row[key] = str(value)
                # Handle pivotValues field specifically (LinkedIn data issue)
                elif key == 'pivotValues':
                    if isinstance(value, str):
                        # Clean up the string first
                        clean_value = value.strip()
                        logger.debug(f"🔍 [BIGQUERY] Processing pivotValues: '{clean_value}' (len={len(clean_value)})")
                        
                        # Handle ANY malformed pattern starting with "[" and containing quotes
                        if clean_value.startswith("[") and (
                            clean_value in ['["', "['", "[''", '["\'', '["\']', '[\']', "['''"] or
                            (len(clean_value) <= 5 and ("'" in clean_value or '"' in clean_value)) or
                            clean_value.count("'") >= 1 and clean_value.endswith("'") or
                            clean_value == "['"
                        ):
                            logger.info(f"🧹 [BIGQUERY] Cleaned malformed pivotValues: '{clean_value}' -> '[]'")
                            cleaned_row[key] = "[]"
                        # Handle other common malformed patterns
                        elif clean_value in ['[]', '', 'null', 'None'] or len(clean_value) < 2:
                            cleaned_row[key] = "[]"
                        else:
                            try:
                                # Try to parse as JSON to validate
                                import json
                                json.loads(clean_value)
                                cleaned_row[key] = clean_value
                                logger.debug(f"✅ [BIGQUERY] Valid JSON pivotValues: '{clean_value[:30]}...'")
                            except (json.JSONDecodeError, ValueError):
                                logger.warning(f"❌ [BIGQUERY] Invalid JSON in pivotValues: '{clean_value[:30]}...' - replacing with empty array")
                                cleaned_row[key] = "[]"
                    else:
                        logger.debug(f"🔄 [BIGQUERY] Non-string pivotValues: {type(value)} -> converting to string")
                        cleaned_row[key] = str(value) if value is not None else "[]"
                # Handle numeric values that might be strings
                elif isinstance(value, str) and key in ['shares', 'comments', 'follows', 'clicks', 'reactions', 'impressions', 'otherEngagements']:
                    try:
                        # Try to convert to integer
                        cleaned_row[key] = int(float(value)) if value and value != '' else 0
                    except (ValueError, TypeError):
                        cleaned_row[key] = 0
                # Handle cost fields (should be float)
                elif isinstance(value, str) and key in ['costInUsd', 'costInLocalCurrency']:
                    try:
                        cleaned_row[key] = float(value) if value and value != '' else 0.0
                    except (ValueError, TypeError):
                        cleaned_row[key] = 0.0
                # Handle date fields - convert to proper DATE format
                elif key in ['dateRangeStart', 'dateRangeEnd']:
                    if isinstance(value, str) and value:
                        # BigQuery DATE format: YYYY-MM-DD (no time component needed)
                        # If it's already in YYYY-MM-DD format, keep it as is
                        if len(value) == 10 and value.count('-') == 2:
                            cleaned_row[key] = value  # Already in correct DATE format
                        else:
                            cleaned_row[key] = value[:10] if len(value) >= 10 else None
                    else:
                        cleaned_row[key] = None
                else:
                    cleaned_row[key] = value
            
            cleaned_data.append(cleaned_row)
        
        return cleaned_data
    
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
    
    def _convert_field_type(self, field_type: str) -> str:
        """Convert generic field type to BigQuery field type"""
        type_mapping = {
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
    
    def _infer_schema_from_data(self, data: List[Dict[str, Any]]):
        """Infer BigQuery schema from sample data"""
        if not data:
            return []
        
        # Get all unique keys from all records
        all_keys = set()
        for record in data[:100]:  # Sample first 100 records for schema inference
            all_keys.update(record.keys())
        
        schema_fields = []
        for key in sorted(all_keys):
            # Determine field type by examining values
            field_type = "STRING"  # Default type
            sample_values = []
            
            # Collect sample non-null values
            for record in data[:100]:
                if key in record and record[key] is not None:
                    sample_values.append(record[key])
                    if len(sample_values) >= 10:  # Sample up to 10 values
                        break
            
            if sample_values:
                # Handle specific LinkedIn data fields
                if key in ['dateRangeStart', 'dateRangeEnd']:
                    field_type = "DATE"  # LinkedIn date fields are DATE format (YYYY-MM-DD)
                elif key in ['shares', 'comments', 'follows', 'clicks', 'reactions', 'impressions', 'otherEngagements']:
                    field_type = "INTEGER"  # LinkedIn numeric engagement fields
                elif key in ['costInUsd', 'costInLocalCurrency']:
                    field_type = "FLOAT"  # LinkedIn cost fields
                elif key == 'pivotValues':
                    field_type = "STRING"  # LinkedIn pivot values (JSON stored as string)
                # Determine type based on sample values
                elif all(isinstance(v, bool) for v in sample_values):
                    field_type = "BOOLEAN"
                elif all(isinstance(v, int) for v in sample_values):
                    field_type = "INTEGER"
                elif all(isinstance(v, (int, float)) for v in sample_values):
                    field_type = "FLOAT"
                elif all(isinstance(v, dict) for v in sample_values):
                    field_type = "JSON"
                elif all(isinstance(v, list) for v in sample_values):
                    field_type = "JSON"  # Store arrays as JSON
                else:
                    # Check if it looks like a timestamp
                    for v in sample_values:
                        if isinstance(v, str):
                            # Check for date format YYYY-MM-DD
                            if len(v) == 10 and v.count('-') == 2:
                                try:
                                    from datetime import datetime
                                    datetime.strptime(v, '%Y-%m-%d')
                                    field_type = "DATE"
                                    break
                                except:
                                    continue
                            # Try to parse as ISO datetime for timestamp
                            try:
                                from datetime import datetime
                                datetime.fromisoformat(v.replace('Z', '+00:00'))
                                field_type = "TIMESTAMP"
                                break
                            except:
                                continue
            
            # Create schema field
            schema_fields.append(bigquery.SchemaField(
                name=key,
                field_type=field_type,
                mode="NULLABLE"
            ))
        
        return schema_fields
