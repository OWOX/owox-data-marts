"""
Data Storage Service - Core business logic for data storages
Based on base/backend/src/data-marts/services/data-storage.service.ts
"""

from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_
from fastapi import HTTPException, status
from app.models import DataStorage, DataStorageType
from app.schemas.data_storage import DataStorageCreate, DataStorageUpdate
import logging
import uuid

logger = logging.getLogger(__name__)

class DataStorageService:
    """Core service for data storage operations"""
    
    def __init__(self):
        pass
    
    def create_data_storage(
        self, 
        db: Session, 
        storage_data: DataStorageCreate, 
        created_by_id: str,
        project_id: str
    ) -> DataStorage:
        """Create a new data storage"""
        try:
            # Validate storage configuration
            self._validate_storage_config(storage_data.storage_type, storage_data.config)
            
            # Encrypt credentials before storing
            encrypted_credentials = self._encrypt_credentials(storage_data.credentials)
            
            # Create data storage
            db_storage = DataStorage(
                id=uuid.uuid4(),
                title=storage_data.title,
                description=storage_data.description,
                storage_type=storage_data.storage_type,
                config=storage_data.config,
                credentials=encrypted_credentials,
                is_active=True,
                project_id=project_id,
                created_by_id=created_by_id
            )
            
            db.add(db_storage)
            db.commit()
            db.refresh(db_storage)
            
            logger.info(f"Created data storage: {db_storage.id}")
            return db_storage
            
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to create data storage: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create data storage"
            )
    
    def get_by_id(self, db: Session, storage_id: str) -> Optional[DataStorage]:
        """Get data storage by ID"""
        return db.query(DataStorage).filter(
            and_(
                DataStorage.id == storage_id,
                DataStorage.deleted_at.is_(None)
            )
        ).first()
    
    def get_by_project(
        self, 
        db: Session, 
        project_id: str, 
        skip: int = 0, 
        limit: int = 100
    ) -> List[DataStorage]:
        """Get data storages by project ID"""
        return db.query(DataStorage).filter(
            and_(
                DataStorage.project_id == project_id,
                DataStorage.deleted_at.is_(None)
            )
        ).offset(skip).limit(limit).all()
    
    def update_data_storage(
        self, 
        db: Session, 
        storage_id: str, 
        storage_data: DataStorageUpdate
    ) -> Optional[DataStorage]:
        """Update a data storage"""
        try:
            db_storage = self.get_by_id(db, storage_id)
            if not db_storage:
                return None
            
            # Update fields
            update_data = storage_data.dict(exclude_unset=True)
            
            # Handle credentials encryption if provided
            if 'credentials' in update_data:
                update_data['credentials'] = self._encrypt_credentials(update_data['credentials'])
            
            # Validate config if provided
            if 'config' in update_data:
                self._validate_storage_config(db_storage.storage_type, update_data['config'])
            
            for field, value in update_data.items():
                setattr(db_storage, field, value)
            
            db.commit()
            db.refresh(db_storage)
            
            logger.info(f"Updated data storage: {storage_id}")
            return db_storage
            
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to update data storage {storage_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update data storage"
            )
    
    def delete_data_storage(self, db: Session, storage_id: str) -> bool:
        """Soft delete a data storage"""
        try:
            db_storage = self.get_by_id(db, storage_id)
            if not db_storage:
                return False
            
            # Check if storage is being used by any data marts
            from app.models import DataMart
            data_marts_count = db.query(DataMart).filter(
                and_(
                    DataMart.storage_id == storage_id,
                    DataMart.deleted_at.is_(None)
                )
            ).count()
            
            if data_marts_count > 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot delete storage that is being used by data marts"
                )
            
            # Soft delete
            from datetime import datetime, timezone
            db_storage.deleted_at = datetime.now(timezone.utc)
            
            db.commit()
            
            logger.info(f"Deleted data storage: {storage_id}")
            return True
            
        except HTTPException:
            raise
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to delete data storage {storage_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete data storage"
            )
    
    def test_connection(self, db: Session, storage_id: str) -> Dict[str, Any]:
        """Test connection to a data storage"""
        try:
            db_storage = self.get_by_id(db, storage_id)
            if not db_storage:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Storage not found"
                )
            
            # Decrypt credentials for connection test
            credentials = self._decrypt_credentials(db_storage.credentials)
            
            # Use storage factory to test connection
            from app.services.storage.storage_factory import storage_factory
            result = storage_factory.validate_storage_config(
                db_storage.storage_type,
                db_storage.config,
                credentials
            )
            
            return {
                "status": "success" if result["valid"] else "failed",
                "message": result["message"],
                "details": result.get("details", {})
            }
                
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to test connection for storage {storage_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to test storage connection"
            )
    
    def _validate_storage_config(self, storage_type: DataStorageType, config: Dict[str, Any]) -> None:
        """Validate storage configuration"""
        if storage_type == DataStorageType.BIGQUERY:
            required_fields = ['project_id', 'dataset_id']
            for field in required_fields:
                if field not in config:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Missing required BigQuery config field: {field}"
                    )
        elif storage_type == DataStorageType.ATHENA:
            required_fields = ['database', 'workgroup', 's3_output_location']
            for field in required_fields:
                if field not in config:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Missing required Athena config field: {field}"
                    )
    
    def _encrypt_credentials(self, credentials: Dict[str, Any]) -> str:
        """Encrypt credentials for storage using same method as platform credentials"""
        import json
        import base64
        from cryptography.fernet import Fernet
        from app.core.config import settings
        
        # Use same encryption as CRUD
        key = base64.urlsafe_b64encode(settings.SECRET_KEY.encode()[:32].ljust(32, b'0'))
        fernet = Fernet(key)
        credentials_json = json.dumps(credentials)
        encrypted_data = fernet.encrypt(credentials_json.encode())
        return base64.urlsafe_b64encode(encrypted_data).decode()
    
    def _decrypt_credentials(self, encrypted_credentials: str) -> Dict[str, Any]:
        """Decrypt credentials for use using same method as platform credentials"""
        import json
        import base64
        from cryptography.fernet import Fernet
        from app.core.config import settings
        
        try:
            # Use same decryption as CRUD
            key = base64.urlsafe_b64encode(settings.SECRET_KEY.encode()[:32].ljust(32, b'0'))
            fernet = Fernet(key)
            encrypted_data = base64.urlsafe_b64decode(encrypted_credentials.encode())
            decrypted_data = fernet.decrypt(encrypted_data)
            return json.loads(decrypted_data.decode())
        except Exception:
            # Fallback for legacy unencrypted data
            if isinstance(encrypted_credentials, dict):
                return encrypted_credentials
            return {}
    

# Global service instance
data_storage_service = DataStorageService()
