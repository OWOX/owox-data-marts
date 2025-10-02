"""
CRUD operations for Connector Runs
"""
from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from app.crud.base import CRUDBase
from app.models.connector_run import ConnectorRun
from app.schemas.connector_run import ConnectorRunCreate, ConnectorRunUpdate


class CRUDConnectorRun(CRUDBase[ConnectorRun, ConnectorRunCreate, ConnectorRunUpdate]):
    
    def create_run(
        self, 
        db: Session, 
        *, 
        connector_id: UUID, 
        execution_id: str,
        user_id: UUID,
        source_collection_name: str = None,
        destination_name: str = None,
        destination_type: str = None,
        scheduled_job_id: UUID = None
    ) -> ConnectorRun:
        """Create a new connector run"""
        db_obj = ConnectorRun(
            execution_id=execution_id,
            connector_id=connector_id,
            triggered_by_id=user_id,
            scheduled_job_id=scheduled_job_id,
            source_collection_name=source_collection_name,
            destination_name=destination_name,
            destination_type=destination_type,
            status="running",
            started_at=datetime.now(timezone.utc)
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj
    
    def complete_run(
        self, 
        db: Session, 
        *, 
        execution_id: str,
        status: str = "completed",
        extracted_records: int = 0,
        transformed_records: int = 0,
        loaded_records: int = 0,
        failed_records: int = 0,
        error_message: str = None
    ) -> Optional[ConnectorRun]:
        """Complete a connector run with results"""
        run = db.query(self.model).filter(ConnectorRun.execution_id == execution_id).first()
        if run:
            run.status = status
            run.completed_at = datetime.now(timezone.utc)
            run.extracted_records = extracted_records
            run.transformed_records = transformed_records
            run.loaded_records = loaded_records
            run.failed_records = failed_records
            run.error_message = error_message
            
            # Calculate duration
            if run.started_at and run.completed_at:
                # Ensure both datetimes are timezone-aware
                if run.started_at.tzinfo is None:
                    run.started_at = run.started_at.replace(tzinfo=timezone.utc)
                if run.completed_at.tzinfo is None:
                    run.completed_at = run.completed_at.replace(tzinfo=timezone.utc)
                    
                run.duration_seconds = (run.completed_at - run.started_at).total_seconds()
            
            db.add(run)
            db.commit()
            db.refresh(run)
        return run
    
    def get_by_user(self, db: Session, *, user_id: UUID, skip: int = 0, limit: int = 100) -> List[ConnectorRun]:
        """Get connector runs for a specific user"""
        return (
            db.query(self.model)
            .filter(ConnectorRun.triggered_by_id == user_id)
            .order_by(desc(ConnectorRun.started_at))
            .offset(skip)
            .limit(limit)
            .all()
        )
    
    def get_recent_runs_summary(self, db: Session, user_id: UUID, days: int = 7) -> Dict[str, Any]:
        """Get summary of recent runs for a user"""
        from datetime import timedelta
        
        since_date = datetime.now(timezone.utc) - timedelta(days=days)
        
        # Fixed SQLAlchemy case syntax for newer versions
        query = db.query(
            func.count(self.model.id).label('total_runs'),
            func.sum(
                func.case(
                    (self.model.status == 'completed', 1),
                    else_=0
                )
            ).label('successful_runs'),
            func.sum(
                func.case(
                    (self.model.status == 'failed', 1), 
                    else_=0
                )
            ).label('failed_runs'),
            func.sum(self.model.extracted_records).label('total_records_processed'),
            func.avg(self.model.duration_seconds).label('avg_duration_seconds')
        ).filter(
            ConnectorRun.triggered_by_id == user_id,
            ConnectorRun.started_at >= since_date
        )
        
        result = query.first()
        
        return {
            'total_runs': result.total_runs or 0,
            'successful_runs': result.successful_runs or 0,
            'failed_runs': result.failed_runs or 0,
            'total_records_processed': result.total_records_processed or 0,
            'avg_duration_seconds': float(result.avg_duration_seconds or 0),
            'success_rate': round((result.successful_runs or 0) / max(result.total_runs or 1, 1) * 100, 1)
        }


connector_run = CRUDConnectorRun(ConnectorRun)
