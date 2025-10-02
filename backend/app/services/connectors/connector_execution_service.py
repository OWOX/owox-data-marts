"""
Connector Execution Service
Based on base/backend/src/data-marts/services/connector-execution.service.ts
"""

from typing import Dict, Any, List, Optional, Iterator
from sqlalchemy.orm import Session
from sqlalchemy import and_
from fastapi import HTTPException, status
from datetime import datetime, timezone
import asyncio
import logging
import uuid

from app.models import DataMartRun, DataMartRunStatus, ConnectorState
from app.connectors.base_connector import (
    BaseConnector, 
    ConnectorConfig, 
    ConnectorType, 
    ConnectorMessage, 
    ConnectorStatus
)
from app.connectors.connector_registry import connector_registry
from app.tasks.connector_tasks import run_connector
import json

logger = logging.getLogger(__name__)


class ConnectorExecutionService:
    """Service for executing connectors"""
    
    def __init__(self):
        self.active_runs: Dict[str, BaseConnector] = {}
    
    async def execute_connector(
        self,
        db: Session,
        data_mart_run_id: str,
        connector_type: ConnectorType,
        config: Dict[str, Any],
        streams: List[str] = None,
        state: Dict[str, Any] = None
    ) -> str:
        """
        Execute a connector asynchronously
        Returns: execution_id for tracking
        """
        try:
            # Create connector config
            connector_config = ConnectorConfig(
                connector_type=connector_type,
                credentials=config.get('credentials', {}),
                config=config.get('config', {}),
                streams=streams or []
            )
            
            # Validate connector is registered
            if not connector_registry.is_registered(connector_type):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Connector type {connector_type.value} is not registered"
                )
            
            # Update run status to running
            self._update_run_status(db, data_mart_run_id, DataMartRunStatus.RUNNING)
            
            # Start connector execution as background task
            execution_id = str(uuid.uuid4())
            task = run_connector.delay(
                execution_id=execution_id,
                data_mart_run_id=data_mart_run_id,
                connector_type=connector_type.value,
                config=connector_config.__dict__,
                streams=streams,
                state=state
            )
            
            logger.info(f"Started connector execution: {execution_id} for run: {data_mart_run_id}")
            return execution_id
            
        except Exception as e:
            logger.error(f"Failed to execute connector: {e}")
            self._update_run_status(db, data_mart_run_id, DataMartRunStatus.FAILED, str(e))
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to execute connector: {str(e)}"
            )
    
    def execute_connector_sync(
        self,
        db: Session,
        connector_type: ConnectorType,
        config: Dict[str, Any],
        streams: List[str] = None,
        state: Dict[str, Any] = None
    ) -> Iterator[ConnectorMessage]:
        """
        Execute a connector synchronously (for testing/debugging)
        """
        try:
            # Create connector config
            connector_config = ConnectorConfig(
                connector_type=connector_type,
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
            
            # Execute connector
            connector.set_status(ConnectorStatus.RUNNING)
            
            # Convert state format if provided
            connector_states = {}
            if state:
                for stream_name, stream_state in state.items():
                    connector_states[stream_name] = stream_state
            
            # Read data from connector
            for message in connector.read(streams=streams, state=connector_states):
                yield message
            
            connector.set_status(ConnectorStatus.SUCCESS)
            
        except Exception as e:
            logger.error(f"Connector execution failed: {e}")
            if 'connector' in locals():
                connector.set_status(ConnectorStatus.FAILED)
            raise
    
    async def cancel_connector_execution(
        self,
        db: Session,
        execution_id: str
    ) -> bool:
        """Cancel a running connector execution"""
        try:
            # TODO: Implement Celery task cancellation
            # For now, just update the run status
            logger.info(f"Cancelling connector execution: {execution_id}")
            
            # Find the associated run and update status
            # This is a simplified implementation
            return True
            
        except Exception as e:
            logger.error(f"Failed to cancel connector execution {execution_id}: {e}")
            return False
    
    def get_connector_specification(
        self,
        connector_type: ConnectorType,
        credentials: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Get connector specification (available streams, etc.)"""
        try:
            # Create temporary connector config
            connector_config = ConnectorConfig(
                connector_type=connector_type,
                credentials=credentials,
                config={}
            )
            
            # Create connector instance
            connector = connector_registry.create_connector(connector_config)
            
            # Get specification
            spec = connector.discover()
            
            return {
                "streams": spec.streams,
                "connection_specification": spec.connection_specification,
                "supported_sync_modes": spec.supported_sync_modes
            }
            
        except Exception as e:
            logger.error(f"Failed to get connector specification: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to get connector specification: {str(e)}"
            )
    
    def validate_connector_config(
        self,
        connector_type: ConnectorType,
        config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Validate connector configuration"""
        try:
            # Create connector config
            connector_config = ConnectorConfig(
                connector_type=connector_type,
                credentials=config.get('credentials', {}),
                config=config.get('config', {})
            )
            
            # Create connector instance
            connector = connector_registry.create_connector(connector_config)
            
            # Validate configuration
            validation_result = connector.validate_config()
            
            # Also check connection if validation passes
            if validation_result.get('valid', False):
                try:
                    connection_result = connector.check_connection()
                    validation_result['connection'] = connection_result
                except Exception as e:
                    validation_result['connection'] = {
                        'status': 'failed',
                        'message': str(e)
                    }
            
            return validation_result
            
        except Exception as e:
            logger.error(f"Failed to validate connector config: {e}")
            return {
                'valid': False,
                'message': str(e)
            }
    
    def get_available_connectors(self) -> List[Dict[str, Any]]:
        """Get list of available connector types"""
        try:
            connectors = []
            for connector_type in connector_registry.list_connector_types():
                info = connector_registry.get_connector_info(connector_type)
                if info:
                    connectors.append(info)
            
            return connectors
            
        except Exception as e:
            logger.error(f"Failed to get available connectors: {e}")
            return []
    
    def _update_run_status(
        self,
        db: Session,
        run_id: str,
        status: DataMartRunStatus,
        error_message: str = None
    ):
        """Update data mart run status"""
        try:
            run = db.query(DataMartRun).filter(DataMartRun.id == run_id).first()
            if run:
                run.status = status
                if status == DataMartRunStatus.RUNNING:
                    run.started_at = datetime.now(timezone.utc)
                elif status in [DataMartRunStatus.SUCCESS, DataMartRunStatus.FAILED, DataMartRunStatus.CANCELLED]:
                    run.finished_at = datetime.now(timezone.utc)
                
                if error_message:
                    run.error_message = error_message
                
                db.commit()
                logger.info(f"Updated run {run_id} status to {status.value}")
            
        except Exception as e:
            logger.error(f"Failed to update run status: {e}")
            db.rollback()
    
    def _save_connector_state(
        self,
        db: Session,
        run_id: str,
        connector_type: str,
        stream: str,
        state_data: Dict[str, Any]
    ):
        """Save connector state for incremental sync"""
        try:
            # Check if state already exists
            existing_state = db.query(ConnectorState).filter(
                and_(
                    ConnectorState.data_mart_run_id == run_id,
                    ConnectorState.connector_type == connector_type,
                    ConnectorState.stream_name == stream
                )
            ).first()
            
            if existing_state:
                existing_state.state_data = state_data
                existing_state.last_sync_at = datetime.now(timezone.utc)
            else:
                new_state = ConnectorState(
                    data_mart_run_id=run_id,
                    connector_type=connector_type,
                    stream_name=stream,
                    state_data=state_data,
                    last_sync_at=datetime.now(timezone.utc),
                    project_id="default"  # TODO: Get from context
                )
                db.add(new_state)
            
            db.commit()
            logger.debug(f"Saved connector state for {connector_type}/{stream}")
            
        except Exception as e:
            logger.error(f"Failed to save connector state: {e}")
            db.rollback()


# Global service instance
connector_execution_service = ConnectorExecutionService()
