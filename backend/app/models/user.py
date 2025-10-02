from sqlalchemy import Column, String, Boolean, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database.base import Base
import uuid


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(100), unique=True, index=True, nullable=False)
    full_name = Column(String(255), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    avatar_url = Column(Text, nullable=True)
    project_id = Column(String(255), nullable=False, default="default")
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships - using lazy imports to avoid circular dependencies
    platform_credentials = relationship("PlatformCredential", back_populates="user", cascade="all, delete-orphan", lazy="dynamic")
    data_marts = relationship("DataMart", back_populates="user", cascade="all, delete-orphan", lazy="dynamic")
    data_storages = relationship("DataStorage", back_populates="user", cascade="all, delete-orphan", lazy="dynamic")
    data_destinations = relationship("DataDestination", back_populates="user", cascade="all, delete-orphan", lazy="dynamic")
    data_collections = relationship("DataCollection", back_populates="user", cascade="all, delete-orphan", lazy="dynamic")
    data_connectors = relationship("DataConnector", back_populates="created_by", cascade="all, delete-orphan", lazy="dynamic")
