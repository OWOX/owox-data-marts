"""
Data Mart Service - Core business logic for data marts
Based on base/backend/src/data-marts/services/data-mart.service.ts
"""

from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_
from fastapi import HTTPException, status
from app.models import DataMart, DataMartStatus, DataMartDefinitionType
from app.schemas.data_mart import DataMartCreate, DataMartUpdate
import logging
import uuid

logger = logging.getLogger(__name__)

class DataMartService:
    """Core service for data mart operations"""
    
    def __init__(self):
        pass
    
    def create_data_mart(
        self, 
        db: Session, 
        data_mart_data: DataMartCreate, 
        created_by_id: str,
        project_id: str
    ) -> DataMart:
        """Create a new data mart"""
        try:
            # For now, skip storage validation as we're transitioning to use destinations
            # TODO: Proper validation when storage/destination architecture is finalized
            logger.info(f"Creating data mart with storage_id: {data_mart_data.storage_id}")
            
            # Convert Pydantic model to dict with by_alias to get 'schema' from 'schema_definition'
            data_dict = data_mart_data.dict(by_alias=True)
            
            # Create data mart
            db_data_mart = DataMart(
                id=uuid.uuid4(),
                title=data_dict.get('title'),
                description=data_dict.get('description'),
                storage_id=data_dict.get('storage_id'),
                destination_id=data_dict.get('destination_id'),
                definition_type=data_dict.get('definition_type'),
                definition=data_dict.get('definition'),
                schema=data_dict.get('schema'),  # Will get value from schema_definition field via alias
                status=DataMartStatus.DRAFT,
                project_id=project_id,
                created_by_id=created_by_id
            )
            
            db.add(db_data_mart)
            db.commit()
            db.refresh(db_data_mart)
            
            logger.info(f"✅ Created data mart: {db_data_mart.id}")
            return db_data_mart
            
        except HTTPException:
            raise
        except Exception as e:
            db.rollback()
            logger.error(f"❌ Failed to create data mart: {e}")
            logger.exception("Full traceback:")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create data mart: {str(e)}"
            )
    
    def get_by_id(self, db: Session, data_mart_id: str) -> Optional[DataMart]:
        """Get data mart by ID"""
        return db.query(DataMart).filter(
            and_(
                DataMart.id == data_mart_id,
                DataMart.deleted_at.is_(None)
            )
        ).first()
    
    def get_by_project(
        self, 
        db: Session, 
        project_id: str, 
        skip: int = 0, 
        limit: int = 100
    ) -> List[DataMart]:
        """Get data marts by project ID"""
        return db.query(DataMart).filter(
            and_(
                DataMart.project_id == project_id,
                DataMart.deleted_at.is_(None)
            )
        ).offset(skip).limit(limit).all()
    
    def update_data_mart(
        self, 
        db: Session, 
        data_mart_id: str, 
        data_mart_data: DataMartUpdate
    ) -> Optional[DataMart]:
        """Update a data mart"""
        try:
            db_data_mart = self.get_by_id(db, data_mart_id)
            if not db_data_mart:
                return None
            
            # Update fields
            update_data = data_mart_data.dict(exclude_unset=True)
            for field, value in update_data.items():
                setattr(db_data_mart, field, value)
            
            db.commit()
            db.refresh(db_data_mart)
            
            logger.info(f"Updated data mart: {data_mart_id}")
            return db_data_mart
            
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to update data mart {data_mart_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update data mart"
            )
    
    def delete_data_mart(self, db: Session, data_mart_id: str) -> bool:
        """Soft delete a data mart"""
        try:
            db_data_mart = self.get_by_id(db, data_mart_id)
            if not db_data_mart:
                return False
            
            # Soft delete
            from datetime import datetime, timezone
            db_data_mart.deleted_at = datetime.now(timezone.utc)
            
            db.commit()
            
            logger.info(f"Deleted data mart: {data_mart_id}")
            return True
            
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to delete data mart {data_mart_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete data mart"
            )
    
    def publish_data_mart(self, db: Session, data_mart_id: str) -> Optional[DataMart]:
        """Publish a data mart (change status from DRAFT to PUBLISHED)"""
        try:
            db_data_mart = self.get_by_id(db, data_mart_id)
            if not db_data_mart:
                return None
            
            if db_data_mart.status != DataMartStatus.DRAFT:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Only draft data marts can be published"
                )
            
            # Validate data mart before publishing
            self._validate_data_mart_for_publishing(db_data_mart)
            
            db_data_mart.status = DataMartStatus.PUBLISHED
            db.commit()
            db.refresh(db_data_mart)
            
            logger.info(f"Published data mart: {data_mart_id}")
            return db_data_mart
            
        except HTTPException:
            raise
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to publish data mart {data_mart_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to publish data mart"
            )
    
    def _validate_data_mart_for_publishing(self, data_mart: DataMart) -> None:
        """Validate that a data mart is ready for publishing"""
        if not data_mart.definition:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Data mart must have a definition to be published"
            )
        
        if not data_mart.definition_type:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Data mart must have a definition type to be published"
            )
        
        # Additional validation logic can be added here
        logger.info(f"Data mart {data_mart.id} validation passed")

# Global service instance
data_mart_service = DataMartService()
