#!/usr/bin/env python3
"""
Database initialization script for OWOX Data Marts
Creates all database tables based on SQLAlchemy models
"""

import sys
import os

# Add the app directory to Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy import create_engine
from app.core.config import settings
from app.database.base import Base  # Use the same Base as models
from app.models import *  # Import all models to register them with Base

def create_tables():
    """Create all database tables"""
    print("Creating database tables...")
    print(f"Using database URL: {settings.DATABASE_URL}")
    
    # Create engine
    engine = create_engine(settings.DATABASE_URL)
    
    # Print tables to be created for debugging
    print(f"Tables to create: {list(Base.metadata.tables.keys())}")
    
    # Create all tables
    Base.metadata.create_all(bind=engine)
    
    print("Database tables created successfully!")

if __name__ == "__main__":
    create_tables()
