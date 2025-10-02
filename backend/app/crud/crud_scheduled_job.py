"""
CRUD operations for Scheduled Jobs
"""
from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session

from app.crud.base import CRUDBase
from app.models.scheduled_job import ScheduledJob
from app.schemas.scheduled_job import ScheduledJobCreate, ScheduledJobUpdate


class CRUDScheduledJob(CRUDBase[ScheduledJob, ScheduledJobCreate, ScheduledJobUpdate]):
    
    def create_with_user(
        self, db: Session, *, obj_in: ScheduledJobCreate, user_id: UUID
    ) -> ScheduledJob:
        """Create a new scheduled job with user reference"""
        obj_in_data = obj_in.dict()
        obj_in_data["created_by_id"] = user_id
        db_obj = self.model(**obj_in_data)
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj
    
    def get_by_connector_and_user(
        self, db: Session, *, connector_id: UUID, user_id: UUID
    ) -> List[ScheduledJob]:
        """Get all scheduled jobs for a connector owned by a user"""
        return (
            db.query(self.model)
            .filter(
                ScheduledJob.connector_id == connector_id,
                ScheduledJob.created_by_id == user_id
            )
            .order_by(ScheduledJob.scheduled_at.desc())
            .all()
        )
    
    def get_by_id_and_user(
        self, db: Session, *, job_id: UUID, user_id: UUID
    ) -> Optional[ScheduledJob]:
        """Get a specific scheduled job by ID and user"""
        return (
            db.query(self.model)
            .filter(
                ScheduledJob.id == job_id,
                ScheduledJob.created_by_id == user_id
            )
            .first()
        )
    
    def get_pending_jobs(self, db: Session) -> List[ScheduledJob]:
        """Get all pending scheduled jobs that are ready to run"""
        from datetime import datetime
        
        return (
            db.query(self.model)
            .filter(
                ScheduledJob.status == "pending",
                ScheduledJob.is_active == True,
                ScheduledJob.scheduled_at <= datetime.now()
            )
            .order_by(ScheduledJob.scheduled_at.asc())
            .all()
        )
    
    def update_status(
        self, db: Session, *, job_id: UUID, status: str, error_message: Optional[str] = None
    ) -> Optional[ScheduledJob]:
        """Update job status and optional error message"""
        from datetime import datetime
        
        db_obj = db.query(self.model).filter(ScheduledJob.id == job_id).first()
        if db_obj:
            db_obj.status = status
            if error_message:
                db_obj.error_message = error_message
            
            if status == "running":
                db_obj.started_at = datetime.now()
            elif status in ["completed", "failed", "cancelled"]:
                db_obj.completed_at = datetime.now()
                
            db.add(db_obj)
            db.commit()
            db.refresh(db_obj)
        
        return db_obj


scheduled_job = CRUDScheduledJob(ScheduledJob)
