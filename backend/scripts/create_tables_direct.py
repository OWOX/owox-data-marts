#!/usr/bin/env python3
"""
Direct table creation script to bypass Alembic issues
Creates all database tables directly using SQLAlchemy
"""

import sys
import os

# Add the app directory to Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy import create_engine, text
from app.core.config import settings
from app.database.base import Base

# Import all models to register them with Base
from app.models.user import User
from app.models.platform_credential import PlatformCredential
from app.models.data_mart import DataMart
from app.models.data_storage import DataStorage
from app.models.data_destination import DataDestination
from app.models.data_mart_run import DataMartRun
from app.models.data_mart_scheduled_trigger import DataMartScheduledTrigger
from app.models.report import Report
from app.models.report_data_cache import ReportDataCache
from app.models.connector_state import ConnectorState
from app.models.data_collection import DataCollection

def create_tables():
    """Create all database tables directly"""
    print("Creating database tables directly...")
    print(f"Using database URL: {settings.DATABASE_URL}")
    
    # Create engine
    engine = create_engine(settings.DATABASE_URL)
    
    # Print tables to be created for debugging
    print(f"Tables to create: {list(Base.metadata.tables.keys())}")
    
    # Drop all tables first (be careful in production!)
    print("Dropping existing tables...")
    Base.metadata.drop_all(bind=engine)
    
    # Create all tables
    print("Creating new tables...")
    Base.metadata.create_all(bind=engine)
    
    print("Database tables created successfully!")
    
    # Verify tables were created
    with engine.connect() as conn:
        result = conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"))
        tables = [row[0] for row in result]
        print(f"Created tables: {tables}")

if __name__ == "__main__":
    create_tables()
