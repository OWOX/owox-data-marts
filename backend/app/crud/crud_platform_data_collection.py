from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc
from uuid import UUID

from app.crud.base import CRUDBase
from app.models.platform_data_collection import PlatformDataCollection
from app.schemas.platform_data_collection import (
    PlatformDataCollectionCreate, 
    PlatformDataCollectionUpdate
)


class CRUDPlatformDataCollection(CRUDBase[PlatformDataCollection, PlatformDataCollectionCreate, PlatformDataCollectionUpdate]):
    
    def create_with_user(
        self, db: Session, *, obj_in: PlatformDataCollectionCreate, user_id: UUID
    ) -> PlatformDataCollection:
        """Create a platform data collection for a specific user"""
        import logging
        logger = logging.getLogger(__name__)
        
        logger.info(f"🔄 [CRUD] Creating platform data collection for user {user_id}")
        logger.info(f"📊 [CRUD] Collection data: {obj_in.dict()}")
        
        try:
            db_obj = PlatformDataCollection(
                user_id=user_id,
                platform_credential_id=obj_in.platform_credential_id,
                platform_name=obj_in.platform_name,
                collection_name=obj_in.collection_name,
                collection_params=obj_in.collection_params,
            )
            logger.info(f"📝 [CRUD] Created db object: {db_obj}")
            
            db.add(db_obj)
            logger.info(f"➕ [CRUD] Added to session")
            
            db.commit()
            logger.info(f"💾 [CRUD] Committed transaction")
            
            db.refresh(db_obj)
            logger.info(f"🔄 [CRUD] Refreshed object: {db_obj.id}")
            
            return db_obj
        except Exception as e:
            logger.error(f"❌ [CRUD] Error creating collection: {str(e)}")
            db.rollback()
            raise
    
    def get_by_user(
        self, db: Session, *, user_id: UUID, skip: int = 0, limit: int = 100
    ) -> List[PlatformDataCollection]:
        """Get platform data collections for a specific user"""
        return (
            db.query(self.model)
            .filter(PlatformDataCollection.user_id == user_id)
            .order_by(desc(PlatformDataCollection.created_at))
            .offset(skip)
            .limit(limit)
            .all()
        )
    
    def get_recent_by_user(
        self, db: Session, *, user_id: UUID, limit: int = 20
    ) -> List[PlatformDataCollection]:
        """Get recent platform data collections for a specific user"""
        return (
            db.query(self.model)
            .filter(PlatformDataCollection.user_id == user_id)
            .order_by(desc(PlatformDataCollection.created_at))
            .limit(limit)
            .all()
        )
    
    def get_active_by_user(
        self, db: Session, *, user_id: UUID
    ) -> List[PlatformDataCollection]:
        """Get active (running/pending) collections for a user"""
        return (
            db.query(self.model)
            .filter(
                PlatformDataCollection.user_id == user_id,
                PlatformDataCollection.status.in_(["pending", "running"])
            )
            .order_by(desc(PlatformDataCollection.created_at))
            .all()
        )
    
    def update_status(
        self, db: Session, *, db_obj: PlatformDataCollection, status: str, **kwargs
    ) -> PlatformDataCollection:
        """Update collection status and other fields"""
        update_data = {"status": status}
        update_data.update(kwargs)
        
        return self.update(db=db, db_obj=db_obj, obj_in=update_data)
    
    def update_progress(
        self, db: Session, *, db_obj: PlatformDataCollection, 
        records_collected: int, total_records: Optional[int] = None
    ) -> PlatformDataCollection:
        """Update collection progress"""
        update_data = {"records_collected": records_collected}
        
        if total_records:
            update_data["total_records"] = total_records
            progress = int((records_collected / total_records) * 100) if total_records > 0 else 0
            update_data["progress_percentage"] = min(progress, 100)
        
        return self.update(db=db, db_obj=db_obj, obj_in=update_data)
    
    def complete_collection(
        self, db: Session, *, db_obj: PlatformDataCollection, 
        collected_data: List[Dict[str, Any]], 
        result_summary: Dict[str, Any]
    ) -> PlatformDataCollection:
        """Mark collection as completed and save results"""
        import logging
        logger = logging.getLogger(__name__)
        from datetime import datetime
        
        logger.info(f"🏁 [CRUD] Completing collection {db_obj.id} with {len(collected_data)} records")
        
        update_data = {
            "status": "completed",
            "completed_at": datetime.utcnow(),
            "collected_data": collected_data,
            "result_summary": result_summary,
            "records_collected": len(collected_data),
            "progress_percentage": 100
        }
        
        logger.info(f"📊 [CRUD] Update data prepared: status={update_data['status']}, records={update_data['records_collected']}")
        
        try:
            result = self.update(db=db, db_obj=db_obj, obj_in=update_data)
            logger.info(f"✅ [CRUD] Collection completed successfully: {result.id}")
            return result
        except Exception as e:
            logger.error(f"❌ [CRUD] Error completing collection: {str(e)}")
            raise
    
    def fail_collection(
        self, db: Session, *, db_obj: PlatformDataCollection, 
        error_message: str, error_details: Optional[Dict[str, Any]] = None
    ) -> PlatformDataCollection:
        """Mark collection as failed"""
        from datetime import datetime
        
        update_data = {
            "status": "failed",
            "completed_at": datetime.utcnow(),
            "error_message": error_message,
            "error_details": error_details
        }
        
        return self.update(db=db, db_obj=db_obj, obj_in=update_data)


# Global instance
platform_data_collection = CRUDPlatformDataCollection(PlatformDataCollection)
