from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database.database import Base


class PlatformCredential(Base):
    __tablename__ = "platform_credentials"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    platform_name = Column(String(100), nullable=False)  # facebook, linkedin, tiktok, etc.
    platform_display_name = Column(String(200), nullable=False)
    
    # Encrypted credential data
    encrypted_credentials = Column(Text, nullable=False)  # JSON string with encrypted values
    
    # Metadata
    account_name = Column(String(255), nullable=True)  # User-friendly name for the account
    account_id = Column(String(255), nullable=True)    # Platform-specific account ID
    
    # Status and validation
    is_active = Column(Boolean, default=True)
    is_valid = Column(Boolean, default=True)
    last_validated_at = Column(DateTime(timezone=True), nullable=True)
    validation_error = Column(Text, nullable=True)
    
    # Access permissions and scopes
    granted_permissions = Column(JSON, nullable=True)  # List of permissions granted
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    user = relationship("User", back_populates="platform_credentials")
    data_collections = relationship("DataCollection", back_populates="platform_credential")
