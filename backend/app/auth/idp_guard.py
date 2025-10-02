"""
IDP Guard - Authentication and Authorization Guards
Based on base/backend/src/idp/guards/idp.guard.ts
"""

from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.database.database import get_db
from app.auth.idp_provider import idp_provider
from app.models import User
import logging

logger = logging.getLogger(__name__)

# Security scheme for JWT tokens
security = HTTPBearer()

class IdpGuard:
    """Authentication and authorization guard"""
    
    def __init__(self):
        self.idp_provider = idp_provider
    
    async def get_current_user(
        self,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        db: Session = Depends(get_db)
    ) -> User:
        """Get current authenticated user"""
        token = credentials.credentials
        return self.idp_provider.get_current_user(db, token)
    
    async def get_current_active_user(
        self,
        current_user: User = Depends(get_current_user)
    ) -> User:
        """Get current active user"""
        if not current_user.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Inactive user"
            )
        return current_user
    
    def require_permission(self, resource: str, action: str):
        """Decorator to require specific permission"""
        def permission_checker(
            current_user: User = Depends(self.get_current_active_user)
        ) -> User:
            if not self.idp_provider.check_permissions(current_user, resource, action):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Insufficient permissions for {action} on {resource}"
                )
            return current_user
        return permission_checker
    
    def require_api_key(self):
        """Decorator to require API key authentication"""
        def api_key_checker(
            credentials: HTTPAuthorizationCredentials = Depends(security)
        ) -> dict:
            api_key = credentials.credentials
            key_info = self.idp_provider.validate_api_key(api_key)
            if not key_info:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid API key"
                )
            return key_info
        return api_key_checker

# Global guard instance
idp_guard = IdpGuard()

# Convenience functions for dependency injection
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """Get current authenticated user - convenience function"""
    return await idp_guard.get_current_user(credentials, db)

async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """Get current active user - convenience function"""
    return await idp_guard.get_current_active_user(current_user)

def require_permission(resource: str, action: str):
    """Require specific permission - convenience function"""
    return idp_guard.require_permission(resource, action)

def require_api_key():
    """Require API key authentication - convenience function"""
    return idp_guard.require_api_key()
