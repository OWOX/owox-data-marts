"""
CRUD operations for Data Connector (pipeline orchestration)
"""
from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.crud.base import CRUDBase
from app.models.data_connector import DataConnector
from app.schemas.data_connector import DataConnectorCreate, DataConnectorUpdate


class CRUDDataConnector(CRUDBase[DataConnector, DataConnectorCreate, DataConnectorUpdate]):
    
    def get_by_user(
        self, db: Session, *, user_id: UUID, skip: int = 0, limit: int = 100
    ) -> List[DataConnector]:
        """Get all data connectors for a specific user"""
        return (
            db.query(self.model)
            .filter(DataConnector.created_by_id == user_id)
            .offset(skip)
            .limit(limit)
            .all()
        )
    
    def get_by_user_and_status(
        self, db: Session, *, user_id: UUID, status: str, skip: int = 0, limit: int = 100
    ) -> List[DataConnector]:
        """Get data connectors for a user filtered by status"""
        return (
            db.query(self.model)
            .filter(and_(
                DataConnector.created_by_id == user_id,
                DataConnector.status == status
            ))
            .offset(skip)
            .limit(limit)
            .all()
        )
    
    def get_by_id_and_user(
        self, db: Session, *, connector_id: UUID, user_id: UUID
    ) -> Optional[DataConnector]:
        """Get a specific connector by ID and user (for security)"""
        return (
            db.query(self.model)
            .filter(and_(
                DataConnector.id == connector_id,
                DataConnector.created_by_id == user_id
            ))
            .first()
        )
    
    def create_with_user(
        self, db: Session, *, obj_in: DataConnectorCreate, user_id: UUID, 
        source_collection_name: str, destination_name: str, destination_type: str
    ) -> DataConnector:
        """Create a new data connector with user and resolved names"""
        obj_data = obj_in.dict()
        obj_data.update({
            "created_by_id": user_id,
            "source_collection_name": source_collection_name,
            "destination_name": destination_name,
            "destination_type": destination_type,
            "status": "idle",
            "is_active": True,
            "records_transferred": 0,
            "success_rate": 0
        })
        db_obj = self.model(**obj_data)
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj
    
    def update_execution_status(
        self, db: Session, *, connector_id: UUID, status: str, 
        records_transferred: Optional[int] = None,
        success_rate: Optional[int] = None,
        execution_time: Optional[str] = None,
        csv_filename: Optional[str] = None,
        error_message: Optional[str] = None
    ) -> Optional[DataConnector]:
        """Update connector execution status and metrics"""
        db_obj = db.query(self.model).filter(DataConnector.id == connector_id).first()
        if db_obj:
            db_obj.status = status
            db_obj.last_execution_status = status
            if execution_time:
                from datetime import datetime
                db_obj.last_execution_at = datetime.fromisoformat(execution_time)
            if records_transferred is not None:
                db_obj.records_transferred = records_transferred
            if success_rate is not None:
                db_obj.success_rate = success_rate
            if csv_filename is not None:
                db_obj.csv_filename = csv_filename
            if error_message is not None:
                db_obj.error_message = error_message
            db.commit()
            db.refresh(db_obj)
        return db_obj


data_connector = CRUDDataConnector(DataConnector)
