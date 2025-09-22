from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, JSON, Enum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database.database import Base
import enum


class DataMartStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    ERROR = "error"


class DataMartType(str, enum.Enum):
    CONNECTOR = "connector"
    SQL = "sql"
    TABLE = "table"


class DataMart(Base):
    __tablename__ = "data_marts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    
    # Data mart configuration
    mart_type = Column(Enum(DataMartType), nullable=False)
    status = Column(Enum(DataMartStatus), default=DataMartStatus.DRAFT)
    
    # Configuration based on type
    configuration = Column(JSON, nullable=True)  # Flexible config for different types
    
    # SQL-specific fields
    sql_query = Column(Text, nullable=True)
    
    # Connector-specific fields
    source_platform = Column(String(100), nullable=True)
    
    # Scheduling
    is_scheduled = Column(Boolean, default=False)
    schedule_config = Column(JSON, nullable=True)  # Cron expression, frequency, etc.
    
    # Metadata
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    next_run_at = Column(DateTime(timezone=True), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    user = relationship("User", back_populates="data_marts")
    data_collections = relationship("DataCollection", back_populates="data_mart")
    reports = relationship("Report", back_populates="data_mart")
