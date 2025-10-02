"""
Data Mart Run Service - Core business logic for data mart runs
Based on base/backend/src/data-marts/services/data-mart-run.service.ts
"""

from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc
from fastapi import HTTPException, status
from datetime import datetime, timezone
import logging
import uuid

from app.models import DataMartRun, DataMartRunStatus, DataMart, ConnectorState
from app.schemas.data_mart_run import DataMartRunCreate, DataMartRunUpdate
from app.services.connectors.connector_execution_service import connector_execution_service
from app.connectors.base_connector import ConnectorType

logger = logging.getLogger(__name__)


class DataMartRunService:
    """Core service for data mart run operations"""
    
    def __init__(self):
        pass
    
    def create_run(
        self, 
        db: Session, 
        data_mart_id: str,
        triggered_by: str = "manual",
        trigger_payload: Dict[str, Any] = None,
        created_by_id: str = None
    ) -> DataMartRun:
        """Create a new data mart run"""
        try:
            # Validate data mart exists
            data_mart = db.query(DataMart).filter(DataMart.id == data_mart_id).first()
            if not data_mart:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Data mart not found"
                )
            
            # Check if there's already a running execution
            existing_run = db.query(DataMartRun).filter(
                and_(
                    DataMartRun.data_mart_id == data_mart_id,
                    DataMartRun.status.in_([DataMartRunStatus.PENDING, DataMartRunStatus.RUNNING])
                )
            ).first()
            
            if existing_run:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Data mart is already running"
                )
            
            # Create new run
            db_run = DataMartRun(
                id=uuid.uuid4(),
                data_mart_id=data_mart_id,
                status=DataMartRunStatus.PENDING,
                triggered_by=triggered_by,
                trigger_payload=trigger_payload or {},
                project_id=data_mart.project_id,
                created_by_id=created_by_id or data_mart.created_by_id
            )
            
            db.add(db_run)
            db.commit()
            db.refresh(db_run)
            
            logger.info(f"Created data mart run: {db_run.id} for data mart: {data_mart_id}")
            return db_run
            
        except HTTPException:
            raise
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to create data mart run: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create data mart run"
            )
    
    def get_by_id(self, db: Session, run_id: str) -> Optional[DataMartRun]:
        """Get data mart run by ID"""
        return db.query(DataMartRun).filter(DataMartRun.id == run_id).first()
    
    def get_by_data_mart(
        self, 
        db: Session, 
        data_mart_id: str, 
        skip: int = 0, 
        limit: int = 100
    ) -> List[DataMartRun]:
        """Get data mart runs by data mart ID"""
        return db.query(DataMartRun).filter(
            DataMartRun.data_mart_id == data_mart_id
        ).order_by(desc(DataMartRun.created_at)).offset(skip).limit(limit).all()
    
    def get_by_project(
        self, 
        db: Session, 
        project_id: str, 
        skip: int = 0, 
        limit: int = 100
    ) -> List[DataMartRun]:
        """Get data mart runs by project ID"""
        return db.query(DataMartRun).filter(
            DataMartRun.project_id == project_id
        ).order_by(desc(DataMartRun.created_at)).offset(skip).limit(limit).all()
    
    async def execute_run(
        self, 
        db: Session, 
        run_id: str
    ) -> str:
        """Execute a data mart run"""
        try:
            # Get the run
            db_run = self.get_by_id(db, run_id)
            if not db_run:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Data mart run not found"
                )
            
            # Check if run is in correct state
            if db_run.status != DataMartRunStatus.PENDING:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot execute run in status: {db_run.status}"
                )
            
            # Get the data mart
            data_mart = db.query(DataMart).filter(DataMart.id == db_run.data_mart_id).first()
            if not data_mart:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Data mart not found"
                )
            
            # Execute based on definition type
            if data_mart.definition_type == "connector":
                execution_id = await self._execute_connector_run(db, db_run, data_mart)
            elif data_mart.definition_type == "sql":
                execution_id = await self._execute_sql_run(db, db_run, data_mart)
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Unsupported definition type: {data_mart.definition_type}"
                )
            
            logger.info(f"Started execution for run: {run_id}, execution_id: {execution_id}")
            return execution_id
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to execute run {run_id}: {e}")
            self._update_run_status(db, run_id, DataMartRunStatus.FAILED, str(e))
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to execute data mart run"
            )
    
    async def cancel_run(self, db: Session, run_id: str) -> bool:
        """Cancel a running data mart run"""
        try:
            db_run = self.get_by_id(db, run_id)
            if not db_run:
                return False
            
            # Check if run can be cancelled
            if db_run.status not in [DataMartRunStatus.PENDING, DataMartRunStatus.RUNNING]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot cancel run in status: {db_run.status}"
                )
            
            # Update status to cancelled
            self._update_run_status(db, run_id, DataMartRunStatus.CANCELLED)
            
            # TODO: Cancel the actual execution (Celery task)
            
            logger.info(f"Cancelled data mart run: {run_id}")
            return True
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to cancel run {run_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to cancel data mart run"
            )
    
    def update_run_metrics(
        self,
        db: Session,
        run_id: str,
        rows_processed: int = 0,
        rows_inserted: int = 0,
        rows_updated: int = 0,
        rows_deleted: int = 0
    ) -> Optional[DataMartRun]:
        """Update run metrics"""
        try:
            db_run = self.get_by_id(db, run_id)
            if not db_run:
                return None
            
            db_run.rows_processed = rows_processed
            db_run.rows_inserted = rows_inserted
            db_run.rows_updated = rows_updated
            db_run.rows_deleted = rows_deleted
            
            db.commit()
            db.refresh(db_run)
            
            logger.debug(f"Updated metrics for run {run_id}")
            return db_run
            
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to update run metrics: {e}")
            return None
    
    def add_run_log(
        self,
        db: Session,
        run_id: str,
        log_entry: Dict[str, Any]
    ):
        """Add log entry to run"""
        try:
            db_run = self.get_by_id(db, run_id)
            if not db_run:
                return
            
            if not db_run.logs:
                db_run.logs = []
            
            # Add timestamp to log entry
            log_entry['timestamp'] = datetime.now(timezone.utc).isoformat()
            
            # Append to logs (assuming logs is a JSON array)
            current_logs = db_run.logs or []
            current_logs.append(log_entry)
            db_run.logs = current_logs
            
            db.commit()
            
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to add log to run {run_id}: {e}")
    
    async def _execute_connector_run(
        self, 
        db: Session, 
        run: DataMartRun, 
        data_mart: DataMart
    ) -> str:
        """Execute a connector-based data mart run"""
        try:
            # Extract connector configuration from data mart definition
            definition = data_mart.definition or {}
            connector_type_str = definition.get('connector_type')
            
            if not connector_type_str:
                raise ValueError("Connector type not specified in data mart definition")
            
            # Convert string to ConnectorType enum
            try:
                connector_type = ConnectorType(connector_type_str)
            except ValueError:
                raise ValueError(f"Unknown connector type: {connector_type_str}")
            
            # Get connector configuration
            config = definition.get('config', {})
            streams = definition.get('streams', [])
            
            # Get previous state for incremental sync
            state = self._get_connector_state(db, run.data_mart_id, connector_type_str)
            
            # Execute connector
            execution_id = await connector_execution_service.execute_connector(
                db=db,
                data_mart_run_id=str(run.id),
                connector_type=connector_type,
                config=config,
                streams=streams,
                state=state
            )
            
            return execution_id
            
        except Exception as e:
            logger.error(f"Failed to execute connector run: {e}")
            raise
    
    async def _execute_sql_run(
        self, 
        db: Session, 
        run: DataMartRun, 
        data_mart: DataMart
    ) -> str:
        """Execute a SQL-based data mart run"""
        try:
            # TODO: Implement SQL execution
            # This would involve:
            # 1. Get SQL query from data mart definition
            # 2. Execute against the storage (BigQuery, Athena, etc.)
            # 3. Handle results and update run status
            
            raise NotImplementedError("SQL execution not yet implemented")
            
        except Exception as e:
            logger.error(f"Failed to execute SQL run: {e}")
            raise
    
    def _get_connector_state(
        self, 
        db: Session, 
        data_mart_id: str, 
        connector_type: str
    ) -> Dict[str, Any]:
        """Get the latest connector state for incremental sync"""
        try:
            # Get the most recent successful run for this data mart
            last_successful_run = db.query(DataMartRun).filter(
                and_(
                    DataMartRun.data_mart_id == data_mart_id,
                    DataMartRun.status == DataMartRunStatus.SUCCESS
                )
            ).order_by(desc(DataMartRun.finished_at)).first()
            
            if not last_successful_run:
                return {}
            
            # Get connector states from the last successful run
            connector_states = db.query(ConnectorState).filter(
                and_(
                    ConnectorState.data_mart_run_id == str(last_successful_run.id),
                    ConnectorState.connector_type == connector_type
                )
            ).all()
            
            # Convert to state dictionary
            state = {}
            for cs in connector_states:
                state[cs.stream_name] = cs.state_data
            
            return state
            
        except Exception as e:
            logger.error(f"Failed to get connector state: {e}")
            return {}
    
    def _update_run_status(
        self,
        db: Session,
        run_id: str,
        status: DataMartRunStatus,
        error_message: str = None
    ):
        """Update run status"""
        try:
            db_run = self.get_by_id(db, run_id)
            if not db_run:
                return
            
            db_run.status = status
            
            if status == DataMartRunStatus.RUNNING:
                db_run.started_at = datetime.now(timezone.utc)
            elif status in [DataMartRunStatus.SUCCESS, DataMartRunStatus.FAILED, DataMartRunStatus.CANCELLED]:
                db_run.finished_at = datetime.now(timezone.utc)
            
            if error_message:
                db_run.error_message = error_message
            
            db.commit()
            logger.info(f"Updated run {run_id} status to {status.value}")
            
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to update run status: {e}")


# Global service instance
data_mart_run_service = DataMartRunService()
