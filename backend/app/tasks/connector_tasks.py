from celery import current_task
from app.tasks.celery_app import celery_app
from app.connectors.connector_registry import connector_registry
from app.connectors.base_connector import ConnectorType, ConnectorConfig, ConnectorMessage, ConnectorStatus
from app.services.storage.bigquery_facade import BigQueryFacade
from app.database.database import get_db
from app.models import DataConnector, DataDestination, DataStorage
from sqlalchemy.orm import Session
import logging
import json
import pandas as pd
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

@celery_app.task(bind=True)
def run_connector(self, execution_id: str, data_mart_run_id: str, connector_type: str, config: dict, streams: List[str] = None, state: dict = None):
    """Execute a connector run"""
    try:
        # Update task status
        self.update_state(state='PROGRESS', meta={'status': f'Starting {connector_type} connector'})
        
        logger.info(f"Starting connector execution: {execution_id} for run: {data_mart_run_id}")
        
        # Get database session
        db = next(get_db())
        
        try:
            # Convert connector type string to enum
            connector_type_enum = ConnectorType(connector_type)
            
            # Create connector config
            connector_config = ConnectorConfig(
                connector_type=connector_type_enum,
                credentials=config.get('credentials', {}),
                config=config.get('config', {}),
                streams=streams or []
            )
            
            # Create connector instance
            connector = connector_registry.create_connector(connector_config)
            
            # Validate configuration
            validation_result = connector.validate_config()
            if not validation_result.get('valid', False):
                raise ValueError(f"Invalid configuration: {validation_result.get('message')}")
            
            # Check connection
            connection_result = connector.check_connection()
            if connection_result.get('status') != 'success':
                raise ValueError(f"Connection failed: {connection_result.get('message')}")
            
            # Update status to running
            self.update_state(state='PROGRESS', meta={'status': f'Reading data from {connector_type}'})
            
            # Execute connector and collect data
            connector.set_status(ConnectorStatus.RUNNING)
            records_by_stream = {}
            total_records = 0
            
            # Convert state format if provided
            connector_states = {}
            if state:
                for stream_name, stream_state in state.items():
                    connector_states[stream_name] = stream_state
            
            # Read data from connector
            for message in connector.read(streams=streams, state=connector_states):
                if message.type == "RECORD":
                    stream_name = message.message['stream']
                    record_data = message.message['data']
                    
                    if stream_name not in records_by_stream:
                        records_by_stream[stream_name] = []
                    
                    records_by_stream[stream_name].append(record_data)
                    total_records += 1
                    
                    # Update progress periodically
                    if total_records % 1000 == 0:
                        self.update_state(
                            state='PROGRESS',
                            meta={'status': f'Processed {total_records} records'}
                        )
                elif message.type == "LOG":
                    logger.info(f"Connector log: {message.message.get('message', '')}")
            
            if total_records == 0:
                logger.warning("No records extracted from connector")
                return {
                    'status': 'SUCCESS',
                    'connector_type': connector_type,
                    'execution_id': execution_id,
                    'records_processed': 0,
                    'message': 'No records found to process'
                }
            
            # Update status to loading data to destination
            self.update_state(state='PROGRESS', meta={'status': f'Loading {total_records} records to BigQuery'})
            
            # Get data connector details from database
            # For now, we'll load to BigQuery using the provided credentials
            # TODO: Get proper destination configuration from database
            
            # Load data to BigQuery
            records_loaded = _load_to_bigquery(records_by_stream, config.get('destination_config', {}))
            
            connector.set_status(ConnectorStatus.SUCCESS)
            
            return {
                'status': 'SUCCESS',
                'connector_type': connector_type,
                'execution_id': execution_id,
                'records_processed': total_records,
                'records_loaded': records_loaded,
                'message': f'{connector_type} connector executed successfully'
            }
            
        finally:
            db.close()
        
    except Exception as exc:
        logger.error(f"Connector run failed: {exc}")
        self.update_state(
            state='FAILURE',
            meta={'error': str(exc)}
        )
        raise


def _load_to_bigquery(records_by_stream: Dict[str, List[Dict]], destination_config: Dict[str, Any]) -> int:
    """Load records to BigQuery destination"""
    try:
        # Get BigQuery configuration from destination config or environment
        bigquery_config = {
            'project_id': destination_config.get('project_id', 'ecoledesponts'),
            'dataset_id': destination_config.get('dataset_id', 'owox_data_marts'),
            'location': destination_config.get('location', 'US')
        }
        
        # Get service account credentials from destination config
        # This should come from the data destination configuration in the database
        service_account_key = destination_config.get('service_account_key')
        
        if not service_account_key:
            # Try to get from environment variables
            import os
            google_credentials = os.getenv('GOOGLE_APPLICATION_CREDENTIALS_JSON')
            if google_credentials:
                try:
                    service_account_key = json.loads(google_credentials)
                    logger.info("Using BigQuery credentials from environment variable")
                except json.JSONDecodeError:
                    logger.error("Invalid JSON in GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable")
                    raise Exception("Invalid BigQuery credentials configuration")
            else:
                logger.error("No BigQuery credentials found. Please configure service account key in data destination or set GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable")
                raise Exception("BigQuery credentials not configured")
        
        credentials = {'service_account_key': service_account_key}
        
        # Create BigQuery facade
        bq_facade = BigQueryFacade(bigquery_config, credentials)
        
        # Test connection first
        connection_test = bq_facade.test_connection()
        if connection_test['status'] != 'success':
            raise Exception(f"BigQuery connection failed: {connection_test['message']}")
        
        total_loaded = 0
        
        # Load each stream to BigQuery
        for stream_name, records in records_by_stream.items():
            if not records:
                continue
                
            logger.info(f"Loading {len(records)} records from stream {stream_name} to BigQuery")
            
            # Convert records to DataFrame for easier handling
            df = pd.DataFrame(records)
            
            # Convert DataFrame back to list of dicts for BigQuery insertion
            records_for_bq = df.to_dict('records')
            
            # Create table name (sanitize stream name)
            table_name = stream_name.lower().replace(' ', '_').replace('-', '_')
            
            # Try to insert data (table will be created automatically if it doesn't exist)
            result = bq_facade.insert_data(table_name, records_for_bq)
            
            if result['status'] == 'success':
                total_loaded += result.get('rows_inserted', len(records_for_bq))
                logger.info(f"Successfully loaded {len(records_for_bq)} records to table {table_name}")
            else:
                logger.error(f"Failed to load data to table {table_name}: {result['message']}")
                raise Exception(f"Failed to load data to BigQuery: {result['message']}")
        
        return total_loaded
        
    except Exception as e:
        logger.error(f"Failed to load data to BigQuery: {e}")
        raise

@celery_app.task
def validate_connector_config(connector_type: str, config: dict):
    """Validate connector configuration"""
    try:
        logger.info(f"Validating configuration for {connector_type}")
        # TODO: Implement connector config validation
        return {'status': 'SUCCESS', 'message': 'Configuration is valid'}
    except Exception as exc:
        logger.error(f"Connector config validation failed: {exc}")
        raise
