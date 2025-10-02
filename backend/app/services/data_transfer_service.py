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
