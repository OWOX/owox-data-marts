from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(100), unique=True, index=True, nullable=False)
    full_name = Column(String(255), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    avatar_url = Column(Text, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    platform_credentials = relationship("PlatformCredential", back_populates="user", cascade="all, delete-orphan")
    data_marts = relationship("DataMart", back_populates="user", cascade="all, delete-orphan")
    data_collections = relationship("DataCollection", back_populates="user", cascade="all, delete-orphan")
    reports = relationship("Report", back_populates="user", cascade="all, delete-orphan")
