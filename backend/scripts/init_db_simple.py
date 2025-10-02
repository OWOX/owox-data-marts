#!/usr/bin/env python3
"""
Simple database initialization script
Creates tables directly without Alembic
"""

import sys
import os
import time
import psycopg2
from psycopg2 import OperationalError

# Add the app directory to Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

def wait_for_db():
    """Wait for database to be ready"""
    print("⏳ Waiting for database to be ready...")
    
    max_retries = 30
    retry_count = 0
    
    while retry_count < max_retries:
        try:
            # Try to connect - with POSTGRES_HOST_AUTH_METHOD=trust, password is optional
            conn = psycopg2.connect(
                host="postgres",
                port=5432,
                database="owox_data_marts",
                user="postgres"
                # password is not needed with trust auth method
            )
            conn.close()
            print("✅ Database is ready!")
            return True
        except OperationalError as e:
            retry_count += 1
            print(f"⏳ Database not ready yet (attempt {retry_count}/{max_retries}): {e}")
            time.sleep(2)
    
    print("❌ Database connection timeout")
    return False

def create_tables():
    """Create all tables directly using SQLAlchemy"""
    try:
        from sqlalchemy import create_engine
        from app.database.base import Base
        
        # Import all models to register them
        import app.models.user
        import app.models.platform_credential
        import app.models.data_mart
        import app.models.data_storage
        import app.models.data_destination
        import app.models.data_mart_run
        import app.models.data_mart_scheduled_trigger
        import app.models.report
        import app.models.report_data_cache
        import app.models.connector_state
        import app.models.data_collection
        
        # Create engine with the correct URL
        DATABASE_URL = "postgresql://postgres:postgres@postgres:5432/owox_data_marts"
        engine = create_engine(DATABASE_URL)
        
        print("🔨 Creating database tables...")
        
        # Drop all tables first (for clean slate in development)
        Base.metadata.drop_all(bind=engine)
        print("✅ Dropped existing tables")
        
        # Create all tables
        Base.metadata.create_all(bind=engine)
        print("✅ Created all tables")
        
        # List created tables
        from sqlalchemy import inspect
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        print(f"📋 Created {len(tables)} tables: {', '.join(tables)}")
        
        return True
        
    except Exception as e:
        print(f"❌ Failed to create tables: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Main initialization function"""
    print("🚀 Initializing OWOX Data Marts database (Simple Mode)...")
    
    # Wait for database
    if not wait_for_db():
        sys.exit(1)
    
    # Create tables
    if not create_tables():
        sys.exit(1)
    
    print("🎉 Database initialization completed successfully!")

if __name__ == "__main__":
    main()
