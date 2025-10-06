"""
Data Transfer Service - Handles actual data movement between collections and destinations
"""
import logging
import pandas as pd
from sqlalchemy import create_engine, text
from typing import Optional, Dict, Any
from datetime import datetime
import os
from pathlib import Path

from app.database.database import get_db
from app.crud.crud_platform_data_collection import platform_data_collection
from app.services.data_marts.data_destination_service import DataDestinationService
from app.services.storage.bigquery_facade import BigQueryFacade

logger = logging.getLogger(__name__)

class DataTransferService:
    
    def __init__(self):
        self.destination_service = DataDestinationService()
    
    async def transfer_data(self, db, source_collection_id: str, destination_id: str) -> Dict[str, Any]:
        """
        Transfer data from source collection to destination
        """
        try:
            logger.info(f"🚀 [DATA TRANSFER] Starting transfer from {source_collection_id} to {destination_id}")
            
            # 1. Get destination configuration
            destination = self.destination_service.get_by_id(db, destination_id)
            if not destination:
                raise Exception(f"Destination {destination_id} not found")
            
            logger.info(f"📋 [DATA TRANSFER] Destination: {destination.name} ({destination.storage_type})")
            
            # 2. Get collection data
            collection_data = await self._get_collection_data(db, source_collection_id)
            if not collection_data:
                raise Exception(f"No data found in collection {source_collection_id}")
            
            records_count = len(collection_data)
            logger.info(f"📊 [DATA TRANSFER] Found {records_count} records to transfer")
            
            # 3. Transfer based on destination type
            if destination.storage_type.upper() == "POSTGRES":
                result = await self._transfer_to_postgres(collection_data, destination.configuration)
            elif destination.storage_type.upper() == "CSV":
                # Add destination name to config for CSV filename
                csv_config = {**destination.configuration, 'destination_name': destination.name}
                result = await self._transfer_to_csv(collection_data, csv_config)
            elif destination.storage_type.upper() == "BIGQUERY":
                result = await self._transfer_to_bigquery(collection_data, destination.configuration, destination)
            else:
                raise Exception(f"Unsupported destination type: {destination.storage_type}")
            
            logger.info(f"✅ [DATA TRANSFER] Successfully transferred {result['records_transferred']} records")
            
            return {
                'success': True,
                'records_transferred': result['records_transferred'],
                'destination_info': result.get('destination_info', ''),
                'file_path': result.get('file_path'),  # For CSV downloads
                'filename': result.get('filename'),    # For CSV downloads
                'transfer_time': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"❌ [DATA TRANSFER] Transfer failed: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'records_transferred': 0
            }
    
    async def _get_collection_data(self, db, collection_id: str) -> Optional[list]:
        """Get actual collected data from the database"""
        try:
            from app.models.platform_data_collection import PlatformDataCollection
            
            logger.info(f"📥 [DATA TRANSFER] Retrieving real data for collection {collection_id}")
            
            # Get the collection from database
            collection = db.query(PlatformDataCollection).filter(
                PlatformDataCollection.id == collection_id
            ).first()
            
            if not collection:
                logger.error(f"❌ [DATA TRANSFER] Collection {collection_id} not found")
                return None
            
            # Check if collection has data
            if not collection.collected_data:
                logger.error(f"❌ [DATA TRANSFER] Collection {collection_id} has no collected data")
                return None
            
            # Get the actual collected data
            collected_data = collection.collected_data
            
            # Handle different data structures
            if isinstance(collected_data, dict):
                # If it's a dict with a 'data' or 'records' key
                if 'data' in collected_data:
                    data_list = collected_data['data']
                elif 'records' in collected_data:
                    data_list = collected_data['records']
                else:
                    # If it's a single record, wrap in list
                    data_list = [collected_data]
            elif isinstance(collected_data, list):
                data_list = collected_data
            else:
                logger.error(f"❌ [DATA TRANSFER] Unexpected data format: {type(collected_data)}")
                return None
            
            logger.info(f"✅ [DATA TRANSFER] Retrieved {len(data_list)} real records from collection {collection_id}")
            return data_list
            
        except Exception as e:
            logger.error(f"❌ [DATA TRANSFER] Error getting collection data: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            return None
    
    async def _transfer_to_postgres(self, data: list, config: dict) -> Dict[str, Any]:
        """Transfer data to PostgreSQL destination"""
        try:
            logger.info(f"🐘 [DATA TRANSFER] Transferring to PostgreSQL: {config.get('database')}")
            
            # Fix host for Docker environment - use postgres service name instead of localhost
            host = config.get('host', 'localhost')
            if host == 'localhost':
                host = 'postgres'  # Docker service name
            
            # Build connection string  
            conn_str = f"postgresql://{config['username']}:{config['password']}@{host}:{config['port']}/{config['database']}"
            logger.info(f"🔗 [DATA TRANSFER] Connecting to: postgresql://{config['username']}:***@{host}:{config['port']}/{config['database']}")
            
            engine = create_engine(conn_str)
            
            # Convert to DataFrame
            df = pd.DataFrame(data)
            
            # Get table configuration
            table_name = config.get('table_name', 'analytics_data')
            schema_name = config.get('schema_name', 'public')
            
            logger.info(f"📊 [DATA TRANSFER] Data columns: {list(df.columns)}")
            logger.info(f"📋 [DATA TRANSFER] Transferring {len(df)} records to {schema_name}.{table_name}")
            
            # Let pandas create/update the table dynamically based on data structure
            # Use 'replace' if table should be recreated, 'append' to add to existing
            if_exists_mode = 'replace' if config.get('create_table_if_not_exists', True) else 'append'
            
            # Insert data - pandas will automatically create table with correct schema
            records_transferred = df.to_sql(
                name=table_name,
                con=engine,
                schema=schema_name,
                if_exists=if_exists_mode,
                index=False,
                method='multi'
            )
            
            logger.info(f"✅ [DATA TRANSFER] Inserted {records_transferred} records into {schema_name}.{table_name}")
            
            return {
                'records_transferred': len(data),
                'destination_info': f'PostgreSQL table: {schema_name}.{table_name}'
            }
            
        except Exception as e:
            logger.error(f"❌ [DATA TRANSFER] PostgreSQL transfer failed: {str(e)}")
            raise e
    
    async def _transfer_to_csv(self, data: list, config: dict) -> Dict[str, Any]:
        """Transfer data to CSV destination"""
        try:
            logger.info(f"📄 [DATA TRANSFER] Transferring to CSV file")
            
            # Convert to DataFrame
            df = pd.DataFrame(data)
            
            # Create exports directory if it doesn't exist
            exports_dir = Path('/app/exports')
            exports_dir.mkdir(parents=True, exist_ok=True)
            
            # Auto-generate filename with timestamp
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            destination_name = config.get('destination_name', 'export')
            filename = f"{destination_name}_{timestamp}.csv"
            file_path = exports_dir / filename
            
            logger.info(f"📂 [DATA TRANSFER] Generating CSV: {file_path}")
            
            # Save to CSV
            df.to_csv(file_path, index=False)
            
            logger.info(f"✅ [DATA TRANSFER] Saved {len(data)} records to {file_path}")
            
            return {
                'records_transferred': len(data),
                'destination_info': f'CSV file: {filename}',
                'file_path': str(file_path),
                'filename': filename
            }
            
        except Exception as e:
            logger.error(f"❌ [DATA TRANSFER] CSV transfer failed: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            raise e
    
    async def _transfer_to_bigquery(self, data: list, config: dict, destination) -> Dict[str, Any]:
        """Transfer data to BigQuery destination"""
        try:
            import json  # For parsing JSON credentials
            logger.info(f"🏔️ [DATA TRANSFER] Transferring to BigQuery")
            
            # Convert to DataFrame for easier handling
            df = pd.DataFrame(data)
            
            # Extract BigQuery configuration
            # Frontend uses 'destination_project_id', 'destination_dataset_id', etc.
            bigquery_config = {
                'project_id': config.get('destination_project_id') or config.get('project_id'),
                'dataset_id': config.get('destination_dataset_id') or config.get('dataset_id', 'owox_data_marts'),
                'location': config.get('location', 'US')
            }
            
            # Extract credentials from destination's credentials field or configuration
            service_account_key = None
            
            # First, try to get from destination.configuration field (where frontend stores them)
            # Frontend stores it as 'service_account_json' (not 'service_account_key')
            if config.get('service_account_json'):
                try:
                    # Parse the JSON string to get the actual service account object
                    service_account_key = json.loads(config.get('service_account_json'))
                    logger.info("🔑 [DATA TRANSFER] Using BigQuery credentials from destination.configuration (service_account_json)")
                except json.JSONDecodeError as e:
                    logger.error(f"❌ [DATA TRANSFER] Failed to parse service_account_json: {e}")
                    service_account_key = None
            elif config.get('service_account_key'):
                # Fallback to direct service_account_key if it exists
                service_account_key = config.get('service_account_key')
                logger.info("🔑 [DATA TRANSFER] Using BigQuery credentials from destination.configuration (service_account_key)")
            
            # Fallback to destination.credentials field
            elif hasattr(destination, 'credentials') and destination.credentials:
                try:
                    # Parse JSON string if needed
                    if isinstance(destination.credentials, str):
                        creds_dict = json.loads(destination.credentials)
                    else:
                        creds_dict = destination.credentials
                    
                    service_account_key = creds_dict.get('service_account_key')
                    if service_account_key:
                        logger.info("🔑 [DATA TRANSFER] Using BigQuery credentials from destination.credentials")
                except (json.JSONDecodeError, TypeError) as e:
                    logger.warning(f"⚠️ [DATA TRANSFER] Failed to parse destination.credentials: {e}")
            
            credentials = {
                'service_account_key': service_account_key
            }
            
            # If no service account key found, try environment variable
            if not credentials['service_account_key']:
                import os
                google_credentials = os.getenv('GOOGLE_APPLICATION_CREDENTIALS_JSON')
                if google_credentials:
                    try:
                        credentials['service_account_key'] = json.loads(google_credentials)
                        logger.info("🔑 [DATA TRANSFER] Using BigQuery credentials from environment variable")
                    except json.JSONDecodeError:
                        logger.error("❌ [DATA TRANSFER] Invalid JSON in GOOGLE_APPLICATION_CREDENTIALS_JSON")
                        raise Exception("Invalid BigQuery credentials configuration")
                else:
                    logger.error("❌ [DATA TRANSFER] No BigQuery credentials found")
                    raise Exception("BigQuery credentials not configured")
            
            logger.info(f"📋 [DATA TRANSFER] BigQuery config: project={bigquery_config['project_id']}, dataset={bigquery_config['dataset_id']}")
            
            # Create BigQuery facade
            bq_facade = BigQueryFacade(bigquery_config, credentials)
            
            # Test connection first
            connection_test = bq_facade.test_connection()
            if connection_test['status'] != 'success':
                raise Exception(f"BigQuery connection failed: {connection_test['message']}")
            
            logger.info("✅ [DATA TRANSFER] BigQuery connection successful")
            
            # Convert DataFrame to list of dicts for BigQuery insertion
            records_for_bq = df.to_dict('records')
            
            # Use table name from config - frontend uses 'destination_table_name'
            table_name = config.get('destination_table_name') or config.get('table_name', 'linkedin_data')
            
            logger.info(f"📊 [DATA TRANSFER] Data columns: {list(df.columns)}")
            logger.info(f"📋 [DATA TRANSFER] Transferring {len(records_for_bq)} records to table {table_name}")
            
            # Insert data to BigQuery (table will be created automatically if it doesn't exist)
            result = bq_facade.insert_data(table_name, records_for_bq)
            
            if result['status'] == 'success':
                records_transferred = result.get('rows_inserted', len(records_for_bq))
                logger.info(f"✅ [DATA TRANSFER] Successfully loaded {records_transferred} records to BigQuery table {table_name}")
                
                return {
                    'records_transferred': records_transferred,
                    'destination_info': f'BigQuery table: {bigquery_config["project_id"]}.{bigquery_config["dataset_id"]}.{table_name}'
                }
            else:
                logger.error(f"❌ [DATA TRANSFER] BigQuery insert failed: {result['message']}")
                raise Exception(f"Failed to load data to BigQuery: {result['message']}")
                
        except Exception as e:
            logger.error(f"❌ [DATA TRANSFER] BigQuery transfer failed: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            raise e
