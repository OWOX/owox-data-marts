"""
Authentication schemas for request/response validation
"""

from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class UserLogin(BaseModel):
    """User login request schema"""
    email: EmailStr
    password: str

class UserRegister(BaseModel):
    """User registration request schema"""
    email: EmailStr
    password: str
    full_name: str

class Token(BaseModel):
    """JWT token response schema"""
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user_id: str

class TokenData(BaseModel):
    """Token data for validation"""
    user_id: Optional[str] = None

class UserResponse(BaseModel):
    """User response schema"""
    id: str
    email: str
    full_name: str
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

class PasswordReset(BaseModel):
    """Password reset request schema"""
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    """Password reset confirmation schema"""
    token: str
    new_password: str

class ChangePassword(BaseModel):
    """Change password request schema"""
    current_password: str
    new_password: str
