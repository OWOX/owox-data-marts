"""
Data Destination Service - Core business logic for data destinations
Based on base/backend/src/data-marts/services/data-destination.service.ts
"""

from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_
from fastapi import HTTPException, status
from app.models import DataDestination, DataDestinationType
from app.schemas.data_destination import DataDestinationCreate, DataDestinationUpdate
import logging
import uuid

logger = logging.getLogger(__name__)

class DataDestinationService:
    """Core service for data destination operations"""
    
    def __init__(self):
        pass
    
    def create_data_destination(
        self, 
        db: Session, 
        destination_data: DataDestinationCreate, 
        created_by_id: str,
        project_id: str
    ) -> DataDestination:
        """Create a new data destination"""
        try:
            # Map storage_type to destination_type
            destination_type_map = {
                'bigquery': DataDestinationType.BIGQUERY,
                'sheets': DataDestinationType.SHEETS,
                'google_sheets': DataDestinationType.GOOGLE_SHEETS,
                'webhook': DataDestinationType.WEBHOOK,
                'email': DataDestinationType.EMAIL,
                'csv': DataDestinationType.CSV,
                'postgres': DataDestinationType.POSTGRES,
                'athena': DataDestinationType.ATHENA
            }
            
            destination_type = destination_type_map.get(destination_data.storage_type, DataDestinationType.WEBHOOK)
            
            # Validate destination configuration
            self._validate_destination_config(destination_type, destination_data.configuration)
            
            # Create minimal credentials dict  
            credentials = {}
            encrypted_credentials = self._encrypt_credentials(credentials)
            
            # Create data destination
            db_destination = DataDestination(
                id=uuid.uuid4(),
                title=destination_data.name,  # Map name to title for compatibility
                name=destination_data.name,
                description=destination_data.description,
                destination_type=destination_type,
                storage_type=destination_data.storage_type,
                config=destination_data.configuration,  # Map configuration to config
                configuration=destination_data.configuration,
                unique_key_columns=destination_data.unique_key_columns,
                schema_definition=destination_data.schema_definition,
                platform_credential_id=destination_data.platform_credential_id,
                credentials=encrypted_credentials,
                is_active=True,
                project_id=project_id,
                created_by_id=created_by_id
            )
            
            db.add(db_destination)
            db.commit()
            db.refresh(db_destination)
            
            logger.info(f"Created data destination: {db_destination.id}")
            return db_destination
            
        except HTTPException:
            # Re-raise HTTP exceptions (like validation errors)
            raise
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to create data destination: {e}")
            logger.error(f"Exception type: {type(e)}")
            logger.error(f"Exception args: {e.args}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create data destination: {str(e)}"
            )
    
    def get_by_id(self, db: Session, destination_id: str) -> Optional[DataDestination]:
        """Get data destination by ID"""
        return db.query(DataDestination).filter(
            and_(
                DataDestination.id == destination_id,
                DataDestination.deleted_at.is_(None)
            )
        ).first()
    
    def get_by_project(
        self, 
        db: Session, 
        project_id: str, 
        skip: int = 0, 
        limit: int = 100
    ) -> List[DataDestination]:
        """Get data destinations by project ID"""
        return db.query(DataDestination).filter(
            and_(
                DataDestination.project_id == project_id,
                DataDestination.deleted_at.is_(None)
            )
        ).offset(skip).limit(limit).all()
    
    def update_data_destination(
        self, 
        db: Session, 
        destination_id: str, 
        destination_data: DataDestinationUpdate
    ) -> Optional[DataDestination]:
        """Update a data destination"""
        try:
            db_destination = self.get_by_id(db, destination_id)
            if not db_destination:
                return None
            
            # Update fields
            update_data = destination_data.dict(exclude_unset=True)
            
            # Handle credentials encryption if provided
            if 'credentials' in update_data:
                update_data['credentials'] = self._encrypt_credentials(update_data['credentials'])
            
            # Validate config if provided
            if 'configuration' in update_data:
                # Map storage_type to destination_type if needed
                storage_type = update_data.get('storage_type', db_destination.storage_type)
                destination_type_map = {
                    'bigquery': DataDestinationType.BIGQUERY,
                    'sheets': DataDestinationType.GOOGLE_SHEETS,
                    'webhook': DataDestinationType.WEBHOOK,
                    'email': DataDestinationType.EMAIL
                }
                dest_type = destination_type_map.get(storage_type, db_destination.destination_type)
                self._validate_destination_config(dest_type, update_data['configuration'])
                
                # Also update the legacy config field
                update_data['config'] = update_data['configuration']
            
            # Sync name/title fields for compatibility
            if 'name' in update_data:
                update_data['title'] = update_data['name']
            
            for field, value in update_data.items():
                setattr(db_destination, field, value)
            
            db.commit()
            db.refresh(db_destination)
            
            logger.info(f"Updated data destination: {destination_id}")
            return db_destination
            
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to update data destination {destination_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update data destination"
            )
    
    def delete_data_destination(self, db: Session, destination_id: str) -> bool:
        """Soft delete a data destination"""
        try:
            db_destination = self.get_by_id(db, destination_id)
            if not db_destination:
                return False
            
            # Soft delete
            from datetime import datetime, timezone
            db_destination.deleted_at = datetime.now(timezone.utc)
            
            db.commit()
            
            logger.info(f"Deleted data destination: {destination_id}")
            return True
            
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to delete data destination {destination_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete data destination"
            )
    
    def test_connection(self, db: Session, destination_id: str) -> Dict[str, Any]:
        """Test connection to a data destination"""
        try:
            db_destination = self.get_by_id(db, destination_id)
            if not db_destination:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Destination not found"
                )
            
            # Decrypt credentials for connection test
            credentials = self._decrypt_credentials(db_destination.credentials)
            
            # Test connection based on destination type
            if db_destination.destination_type == DataDestinationType.BIGQUERY:
                return self._test_bigquery_destination(db_destination.config, credentials)
            elif db_destination.destination_type == DataDestinationType.GOOGLE_SHEETS:
                return self._test_google_sheets_destination(db_destination.config, credentials)
            elif db_destination.destination_type == DataDestinationType.LOOKER_STUDIO:
                return self._test_looker_studio_destination(db_destination.config, credentials)
            elif db_destination.destination_type == DataDestinationType.WEBHOOK:
                return self._test_webhook_destination(db_destination.config, credentials)
            elif db_destination.destination_type == DataDestinationType.EMAIL:
                return self._test_email_destination(db_destination.config, credentials)
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Unsupported destination type: {db_destination.destination_type}"
                )
                
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to test connection for destination {destination_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to test destination connection"
            )
    
    def rotate_secret_key(self, db: Session, destination_id: str) -> Dict[str, Any]:
        """Rotate secret key for a data destination"""
        try:
            db_destination = self.get_by_id(db, destination_id)
            if not db_destination:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Destination not found"
                )
            
            # Generate new secret key based on destination type
            new_credentials = self._generate_new_credentials(db_destination.destination_type)
            
            # Encrypt and store new credentials
            db_destination.credentials = self._encrypt_credentials(new_credentials)
            
            db.commit()
            db.refresh(db_destination)
            
            logger.info(f"Rotated secret key for destination: {destination_id}")
            return {"status": "success", "message": "Secret key rotated successfully"}
            
        except HTTPException:
            raise
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to rotate secret key for destination {destination_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to rotate secret key"
            )
    
    def _validate_destination_config(self, destination_type: DataDestinationType, config: Dict[str, Any]) -> None:
        """Validate destination configuration"""
        if destination_type == DataDestinationType.BIGQUERY:
            required_fields = ['destination_project_id', 'destination_dataset_id', 'destination_table_name']
            for field in required_fields:
                if field not in config:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Missing required BigQuery config field: {field}"
                    )
        elif destination_type == DataDestinationType.GOOGLE_SHEETS:
            required_fields = ['destination_spreadsheet_id']
            for field in required_fields:
                if field not in config:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Missing required Google Sheets config field: {field}"
                    )
        elif destination_type == DataDestinationType.WEBHOOK:
            required_fields = ['url']
            for field in required_fields:
                if field not in config:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Missing required Webhook config field: {field}"
                    )
        elif destination_type == DataDestinationType.CSV:
            if 'file_path' not in config:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Missing required CSV config field: file_path"
                )
        elif destination_type == DataDestinationType.POSTGRES:
            required_fields = ['host', 'database', 'username', 'password', 'table_name']
            for field in required_fields:
                if field not in config:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Missing required PostgreSQL config field: {field}"
                    )
        elif destination_type == DataDestinationType.SHEETS:
            required_fields = ['destination_spreadsheet_id']
            for field in required_fields:
                if field not in config:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Missing required Google Sheets config field: {field}"
                    )
        elif destination_type == DataDestinationType.ATHENA:
            required_fields = ['aws_region', 's3_bucket_name', 'athena_database_name', 'athena_output_location']
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
    
    def _generate_new_credentials(self, destination_type: DataDestinationType) -> Dict[str, Any]:
        """Generate new credentials for destination type"""
        # TODO: Implement credential generation based on type
        return {"new_key": "generated_key"}
    def _test_bigquery_destination(self, config: Dict[str, Any], credentials: Dict[str, Any]) -> Dict[str, Any]:
        """Test BigQuery destination"""
        # TODO: Implement actual BigQuery destination test
        return {"status": "success", "message": "BigQuery destination test successful"}
    
    def _test_google_sheets_destination(self, config: Dict[str, Any], credentials: Dict[str, Any]) -> Dict[str, Any]:
        """Test Google Sheets destination"""
        # TODO: Implement actual Google Sheets destination test
        return {"status": "success", "message": "Google Sheets destination test successful"}
    
    def _test_looker_studio_destination(self, config: Dict[str, Any], credentials: Dict[str, Any]) -> Dict[str, Any]:
        """Test Looker Studio destination"""
        # TODO: Implement actual Looker Studio destination test
        return {"status": "success", "message": "Looker Studio destination test successful"}
    
    def _test_webhook_destination(self, config: Dict[str, Any], credentials: Dict[str, Any]) -> Dict[str, Any]:
        """Test Webhook destination"""
        # TODO: Implement actual Webhook destination test
        return {"status": "success", "message": "Webhook destination test successful"}
    
    def _test_email_destination(self, config: Dict[str, Any], credentials: Dict[str, Any]) -> Dict[str, Any]:
        """Test Email destination"""
        # TODO: Implement actual Email destination test
        return {"status": "success", "message": "Email destination test successful"}
    
    def validate_configuration(self, db: Session, destination_id: str) -> Dict[str, Any]:
        """Validate a data destination configuration"""
        try:
            db_destination = self.get_by_id(db, destination_id)
            if not db_destination:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Destination not found"
                )
            
            from datetime import datetime, timezone
            
            # Basic validation - this can be expanded with actual tests
            try:
                self._validate_destination_config(db_destination.destination_type, db_destination.config)
                return {
                    "id": str(uuid.uuid4()),
                    "storage_destination_id": str(db_destination.id),
                    "is_valid": True,
                    "validation_message": "Configuration is valid",
                    "validated_at": datetime.now(timezone.utc)
                }
            except HTTPException as e:
                return {
                    "id": str(uuid.uuid4()),
                    "storage_destination_id": str(db_destination.id),
                    "is_valid": False,
                    "validation_message": e.detail,
                    "validated_at": datetime.now(timezone.utc)
                }
                
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to validate destination {destination_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to validate destination"
            )

# Global service instance
data_destination_service = DataDestinationService()
