"""
Amazon Athena Storage Facade
Based on base/backend/src/data-marts/data-storage-types/facades/athena.facade.ts
"""

from typing import Dict, Any, List, Optional
import time
import logging
from datetime import datetime

try:
    import boto3
    from botocore.exceptions import ClientError, NoCredentialsError
    BOTO3_AVAILABLE = True
except ImportError:
    BOTO3_AVAILABLE = False
    boto3 = None

logger = logging.getLogger(__name__)


class AthenaFacade:
    """Facade for Amazon Athena operations"""
    
    def __init__(self, config: Dict[str, Any], credentials: Dict[str, Any]):
        if not BOTO3_AVAILABLE:
            raise ImportError("boto3 is required for Athena operations")
        
        self.config = config
        self.credentials = credentials
        self.database = config.get('database')
        self.workgroup = config.get('workgroup', 'primary')
        self.s3_output_location = config.get('s3_output_location')
        self.region = config.get('region', 'us-east-1')
        
        # Initialize AWS clients
        self.athena_client = self._create_athena_client()
        self.s3_client = self._create_s3_client()
        
    def _create_athena_client(self):
        """Create Athena client with AWS credentials"""
        try:
            session = boto3.Session(
                aws_access_key_id=self.credentials.get('access_key_id'),
                aws_secret_access_key=self.credentials.get('secret_access_key'),
                aws_session_token=self.credentials.get('session_token'),
                region_name=self.region
            )
            
            return session.client('athena')
            
        except Exception as e:
            logger.error(f"Failed to create Athena client: {e}")
            raise
    
    def _create_s3_client(self):
        """Create S3 client for result handling"""
        try:
            session = boto3.Session(
                aws_access_key_id=self.credentials.get('access_key_id'),
                aws_secret_access_key=self.credentials.get('secret_access_key'),
                aws_session_token=self.credentials.get('session_token'),
                region_name=self.region
            )
            
            return session.client('s3')
            
        except Exception as e:
            logger.error(f"Failed to create S3 client: {e}")
            raise
    
    def test_connection(self) -> Dict[str, Any]:
        """Test connection to Athena"""
        try:
            # Test by listing databases
            response = self.athena_client.list_databases(
                CatalogName='AwsDataCatalog'
            )
            
            # Check if our database exists
            databases = [db['Name'] for db in response.get('DatabaseList', [])]
            database_exists = self.database in databases
            
            return {
                "status": "success",
                "message": "Connection successful",
                "details": {
                    "database": self.database,
                    "database_exists": database_exists,
                    "workgroup": self.workgroup,
                    "region": self.region,
                    "available_databases": databases[:10]  # Limit to first 10
                }
            }
            
        except Exception as e:
            return {
                "status": "failed",
                "message": f"Connection failed: {str(e)}"
            }
    
    def execute_query(self, query: str, parameters: Dict[str, Any] = None) -> Dict[str, Any]:
        """Execute a SQL query in Athena"""
        try:
            # Start query execution
            response = self.athena_client.start_query_execution(
                QueryString=query,
                QueryExecutionContext={'Database': self.database},
                ResultConfiguration={
                    'OutputLocation': self.s3_output_location,
                },
                WorkGroup=self.workgroup
            )
            
            query_execution_id = response['QueryExecutionId']
            
            # Wait for query to complete
            execution_result = self._wait_for_query_completion(query_execution_id)
            
            if execution_result['status'] == 'SUCCEEDED':
                # Get query results
                results = self._get_query_results(query_execution_id)
                
                return {
                    "status": "success",
                    "message": "Query executed successfully",
                    "query_execution_id": query_execution_id,
                    "rows": results['rows'],
                    "columns": results['columns'],
                    "total_rows": len(results['rows']),
                    "data_scanned_bytes": execution_result.get('data_scanned_bytes', 0),
                    "execution_time_ms": execution_result.get('execution_time_ms', 0)
                }
            else:
                return {
                    "status": "failed",
                    "message": f"Query failed: {execution_result.get('error_message', 'Unknown error')}",
                    "query_execution_id": query_execution_id
                }
                
        except Exception as e:
            return {
                "status": "failed",
                "message": f"Query execution failed: {str(e)}"
            }
    
    def create_table(self, table_name: str, schema: List[Dict[str, Any]], 
                    location: str = None, format: str = 'PARQUET') -> Dict[str, Any]:
        """Create a table in Athena"""
        try:
            # Build CREATE TABLE statement
            columns = []
            for field in schema:
                field_type = self._convert_field_type(field.get('type', 'string'))
                columns.append(f"`{field['name']}` {field_type}")
            
            columns_str = ",\n  ".join(columns)
            
            # Build the CREATE TABLE query
            if location:
                query = f"""
                CREATE EXTERNAL TABLE IF NOT EXISTS `{self.database}`.`{table_name}` (
                  {columns_str}
                )
                STORED AS {format}
                LOCATION '{location}'
                """
            else:
                query = f"""
                CREATE TABLE IF NOT EXISTS `{self.database}`.`{table_name}` (
                  {columns_str}
                )
                """
            
            # Execute the CREATE TABLE query
            result = self.execute_query(query)
            
            if result['status'] == 'success':
                return {
                    "status": "success",
                    "message": f"Table {table_name} created successfully",
                    "table_name": f"{self.database}.{table_name}"
                }
            else:
                return result
                
        except Exception as e:
            return {
                "status": "failed",
                "message": f"Failed to create table: {str(e)}"
            }
    
    def list_tables(self) -> Dict[str, Any]:
        """List all tables in the database"""
        try:
            response = self.athena_client.list_table_metadata(
                CatalogName='AwsDataCatalog',
                DatabaseName=self.database
            )
            
            tables = []
            for table_metadata in response.get('TableMetadataList', []):
                tables.append({
                    "table_name": table_metadata['Name'],
                    "table_type": table_metadata.get('TableType', 'UNKNOWN'),
                    "created_time": table_metadata.get('CreateTime').isoformat() if table_metadata.get('CreateTime') else None,
                    "last_access_time": table_metadata.get('LastAccessTime').isoformat() if table_metadata.get('LastAccessTime') else None,
                    "location": table_metadata.get('Parameters', {}).get('location', ''),
                    "input_format": table_metadata.get('Parameters', {}).get('inputformat', ''),
                    "output_format": table_metadata.get('Parameters', {}).get('outputformat', '')
                })
            
            return {
                "status": "success",
                "tables": tables,
                "count": len(tables)
            }
            
        except Exception as e:
            return {
                "status": "failed",
                "message": f"Failed to list tables: {str(e)}"
            }
    
    def get_table_schema(self, table_name: str) -> Dict[str, Any]:
        """Get schema of an Athena table"""
        try:
            response = self.athena_client.get_table_metadata(
                CatalogName='AwsDataCatalog',
                DatabaseName=self.database,
                TableName=table_name
            )
            
            table_metadata = response['TableMetadata']
            
            # Extract column information
            columns = []
            for column in table_metadata.get('Columns', []):
                columns.append({
                    "name": column['Name'],
                    "type": column['Type'],
                    "comment": column.get('Comment', '')
                })
            
            return {
                "status": "success",
                "table_name": table_metadata['Name'],
                "columns": columns,
                "table_type": table_metadata.get('TableType', 'UNKNOWN'),
                "location": table_metadata.get('Parameters', {}).get('location', ''),
                "input_format": table_metadata.get('Parameters', {}).get('inputformat', ''),
                "output_format": table_metadata.get('Parameters', {}).get('outputformat', ''),
                "created_time": table_metadata.get('CreateTime').isoformat() if table_metadata.get('CreateTime') else None
            }
            
        except Exception as e:
            return {
                "status": "failed",
                "message": f"Failed to get table schema: {str(e)}"
            }
    
    def drop_table(self, table_name: str) -> Dict[str, Any]:
        """Drop a table from Athena"""
        try:
            query = f"DROP TABLE IF EXISTS `{self.database}`.`{table_name}`"
            result = self.execute_query(query)
            
            if result['status'] == 'success':
                return {
                    "status": "success",
                    "message": f"Table {table_name} dropped successfully"
                }
            else:
                return result
                
        except Exception as e:
            return {
                "status": "failed",
                "message": f"Failed to drop table: {str(e)}"
            }
    
    def dry_run_query(self, query: str) -> Dict[str, Any]:
        """Perform a dry run of a query to validate syntax"""
        try:
            # Athena doesn't have a built-in dry run, so we'll use EXPLAIN
            explain_query = f"EXPLAIN {query}"
            result = self.execute_query(explain_query)
            
            if result['status'] == 'success':
                return {
                    "status": "success",
                    "message": "Query is valid",
                    "execution_plan": result['rows']
                }
            else:
                return {
                    "status": "failed",
                    "message": f"Query validation failed: {result.get('message', 'Unknown error')}"
                }
                
        except Exception as e:
            return {
                "status": "failed",
                "message": f"Query validation failed: {str(e)}"
            }
    
    def _wait_for_query_completion(self, query_execution_id: str, max_wait_time: int = 300) -> Dict[str, Any]:
        """Wait for query execution to complete"""
        start_time = time.time()
        
        while time.time() - start_time < max_wait_time:
            try:
                response = self.athena_client.get_query_execution(
                    QueryExecutionId=query_execution_id
                )
                
                execution = response['QueryExecution']
                status = execution['Status']['State']
                
                if status in ['SUCCEEDED', 'FAILED', 'CANCELLED']:
                    result = {
                        'status': status,
                        'query_execution_id': query_execution_id
                    }
                    
                    if status == 'SUCCEEDED':
                        statistics = execution.get('Statistics', {})
                        result.update({
                            'data_scanned_bytes': statistics.get('DataScannedInBytes', 0),
                            'execution_time_ms': statistics.get('EngineExecutionTimeInMillis', 0),
                            'query_queue_time_ms': statistics.get('QueryQueueTimeInMillis', 0),
                            'total_execution_time_ms': statistics.get('TotalExecutionTimeInMillis', 0)
                        })
                    elif status in ['FAILED', 'CANCELLED']:
                        result['error_message'] = execution['Status'].get('StateChangeReason', 'Unknown error')
                    
                    return result
                
                time.sleep(1)  # Wait 1 second before checking again
                
            except Exception as e:
                return {
                    'status': 'FAILED',
                    'error_message': f"Error checking query status: {str(e)}"
                }
        
        return {
            'status': 'FAILED',
            'error_message': f"Query execution timed out after {max_wait_time} seconds"
        }
    
    def _get_query_results(self, query_execution_id: str) -> Dict[str, Any]:
        """Get results from a completed query"""
        try:
            response = self.athena_client.get_query_results(
                QueryExecutionId=query_execution_id
            )
            
            result_set = response['ResultSet']
            
            # Extract column names
            columns = []
            if 'ColumnInfos' in result_set['ResultSetMetadata']:
                for col_info in result_set['ResultSetMetadata']['ColumnInfos']:
                    columns.append({
                        'name': col_info['Name'],
                        'type': col_info['Type']
                    })
            
            # Extract rows
            rows = []
            for i, row in enumerate(result_set['Rows']):
                if i == 0 and columns:
                    # Skip header row if we have column info
                    continue
                
                row_data = {}
                for j, data in enumerate(row['Data']):
                    column_name = columns[j]['name'] if j < len(columns) else f'column_{j}'
                    row_data[column_name] = data.get('VarCharValue', '')
                
                rows.append(row_data)
            
            return {
                'columns': columns,
                'rows': rows
            }
            
        except Exception as e:
            logger.error(f"Failed to get query results: {e}")
            return {
                'columns': [],
                'rows': []
            }
    
    def _convert_field_type(self, field_type: str) -> str:
        """Convert generic field type to Athena field type"""
        type_mapping = {
            'string': 'string',
            'integer': 'bigint',
            'int': 'bigint',
            'float': 'double',
            'boolean': 'boolean',
            'timestamp': 'timestamp',
            'date': 'date',
            'datetime': 'timestamp',
            'json': 'string',
            'array': 'array<string>'
        }
        
        return type_mapping.get(field_type.lower(), 'string')
