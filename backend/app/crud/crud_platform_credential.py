from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
import json
import base64
from cryptography.fernet import Fernet
from app.core.config import settings
from app.crud.base import CRUDBase
from app.models.platform_credential import PlatformCredential
from app.schemas.platform_credential import PlatformCredentialCreate, PlatformCredentialUpdate

import logging

logger = logging  # use logging module global methods for now.

class CRUDPlatformCredential(CRUDBase[PlatformCredential, PlatformCredentialCreate, PlatformCredentialUpdate]):
    
    def _get_encryption_key(self) -> bytes:
        """Generate encryption key from settings secret key"""
        # In production, use a proper key derivation function
        key = base64.urlsafe_b64encode(settings.SECRET_KEY.encode()[:32].ljust(32, b'0'))
        return key
    
    def _encrypt_credentials(self, credentials: Dict[str, Any]) -> str:
        """Encrypt credential data"""
        fernet = Fernet(self._get_encryption_key())
        credentials_json = json.dumps(credentials)
        encrypted_data = fernet.encrypt(credentials_json.encode())
        return base64.urlsafe_b64encode(encrypted_data).decode()
    
    def _decrypt_credentials(self, encrypted_credentials: str) -> Dict[str, Any]:
        """Decrypt credential data"""
        try:
            fernet = Fernet(self._get_encryption_key())
            encrypted_data = base64.urlsafe_b64decode(encrypted_credentials.encode())
            decrypted_data = fernet.decrypt(encrypted_data)
            return json.loads(decrypted_data.decode())
        except Exception:
            return {}

    def create_with_user(
        self, db: Session, *, obj_in: PlatformCredentialCreate, user_id: int
    ) -> PlatformCredential:


        
        logger.info("------- Temporary checks  --------")
        logger.info(f"obj_in.credentials: {obj_in.credentials}")

        logger.info("------- Encryption process  --------")
        encrypted_creds = self._encrypt_credentials(obj_in.credentials)
        logger.info(f"Encrypted credentials: {encrypted_creds}")
        logger.info(f"Decrypted credentials: {self._decrypt_credentials(encrypted_creds)}")

        logger.info("---------------------------------------------")
        logger.info("------- PlatformCredential creation  --------")
        logger.info("---------------------------------------------")
        db_obj = PlatformCredential(
            user_id=user_id,
            platform_name=obj_in.platform_name,
            platform_display_name=obj_in.platform_display_name,
            account_name=obj_in.account_name,
            account_id=obj_in.account_id,
            encrypted_credentials=encrypted_creds,
            is_active=obj_in.is_active,
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def get_multi_by_user(
        self, db: Session, *, user_id: int, skip: int = 0, limit: int = 100
    ) -> List[PlatformCredential]:
        return (
            db.query(self.model)
            .filter(PlatformCredential.user_id == user_id)
            .offset(skip)
            .limit(limit)
            .all()
        )

    def get_decrypted_credentials(
        self, db: Session, *, credential_id: int, user_id: int
    ) -> Optional[Dict[str, Any]]:
        """Get decrypted credentials for a specific credential"""
        credential = (
            db.query(self.model)
            .filter(
                PlatformCredential.id == credential_id,
                PlatformCredential.user_id == user_id
            )
            .first()
        )
        if not credential:
            return None
        
        return self._decrypt_credentials(credential.encrypted_credentials)

    def update_credentials(
        self, db: Session, *, db_obj: PlatformCredential, credentials: Dict[str, Any]
    ) -> PlatformCredential:
        """Update only the credentials part"""
        encrypted_creds = self._encrypt_credentials(credentials)
        db_obj.encrypted_credentials = encrypted_creds
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def validate_credential(
        self, db: Session, *, credential: PlatformCredential
    ) -> Dict[str, Any]:
        """Validate platform credential by testing API connection"""
        # TODO: Implement platform-specific validation
        # This is a placeholder that should be implemented for each platform
        
        decrypted_creds = self._decrypt_credentials(credential.encrypted_credentials)
        
        # Mock validation - replace with actual platform API calls
        validation_result = {
            "is_valid": True,
            "message": "Credentials validated successfully",
            "permissions": ["read", "write"]  # Platform-specific permissions
        }
        
        # Update validation status in database
        credential.is_valid = validation_result["is_valid"]
        credential.validation_error = None if validation_result["is_valid"] else validation_result["message"]
        credential.granted_permissions = validation_result.get("permissions", [])
        
        from datetime import datetime
        credential.last_validated_at = datetime.utcnow()
        
        db.add(credential)
        db.commit()
        
        return validation_result


platform_credential = CRUDPlatformCredential(PlatformCredential)
