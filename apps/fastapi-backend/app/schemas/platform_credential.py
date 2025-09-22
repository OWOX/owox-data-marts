from typing import Optional, Dict, Any, List
from pydantic import BaseModel
from datetime import datetime


class PlatformCredentialBase(BaseModel):
    platform_name: str
    platform_display_name: str
    account_name: Optional[str] = None
    account_id: Optional[str] = None
    is_active: bool = True


class PlatformCredentialCreate(PlatformCredentialBase):
    credentials: Dict[str, Any]  # Raw credentials that will be encrypted


class PlatformCredentialUpdate(BaseModel):
    platform_display_name: Optional[str] = None
    account_name: Optional[str] = None
    is_active: Optional[bool] = None
    credentials: Optional[Dict[str, Any]] = None


class PlatformCredential(PlatformCredentialBase):
    id: int
    user_id: int
    is_valid: bool
    last_validated_at: Optional[datetime]
    validation_error: Optional[str]
    granted_permissions: Optional[List[str]]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


# Response model that doesn't include sensitive credential data
class PlatformCredentialSafe(BaseModel):
    id: int
    platform_name: str
    platform_display_name: str
    account_name: Optional[str]
    account_id: Optional[str]
    is_active: bool
    is_valid: bool
    last_validated_at: Optional[datetime]
    validation_error: Optional[str]
    granted_permissions: Optional[List[str]]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True
