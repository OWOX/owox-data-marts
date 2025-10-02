#!/usr/bin/env python3
"""
Initialize database with Alembic migrations
This script will:
1. Check if migrations exist
2. Generate initial migration if needed
3. Run migrations
"""

import sys
import os
import subprocess
import glob
from pathlib import Path

# Add the app directory to Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

def check_migrations_exist():
    """Check if any migration files exist"""
    backend_dir = os.path.dirname(os.path.dirname(__file__))
    versions_dir = os.path.join(backend_dir, "alembic", "versions")
    
    # Look for Python migration files (ignore .gitkeep)
    migration_files = glob.glob(os.path.join(versions_dir, "*.py"))
    return len(migration_files) > 0

def generate_initial_migration():
    """Generate initial migration"""
    print("No migrations found. Generating initial migration...")
    
    backend_dir = os.path.dirname(os.path.dirname(__file__))
    os.chdir(backend_dir)
    
    try:
        # First, import all models to ensure they're registered
        print("Importing all models...")
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
        
        # Generate migration
        result = subprocess.run([
            "alembic", "revision", "--autogenerate", 
            "-m", "Initial migration with all OWOX models"
        ], capture_output=True, text=True)
        
        if result.returncode == 0:
            print("✅ Initial migration generated successfully!")
            if result.stdout:
                print(result.stdout)
            return True
        else:
            print("❌ Error generating migration:")
            print(result.stderr)
            return False
            
    except Exception as e:
        print(f"❌ Failed to generate migration: {e}")
        return False

def run_migrations():
    """Run Alembic migrations"""
    print("Running Alembic migrations...")
    
    backend_dir = os.path.dirname(os.path.dirname(__file__))
    os.chdir(backend_dir)
    
    try:
        result = subprocess.run([
            "alembic", "upgrade", "head"
        ], capture_output=True, text=True)
        
        if result.returncode == 0:
            print("✅ Migrations completed successfully!")
            if result.stdout:
                print(result.stdout)
            return True
        else:
            print("❌ Error running migrations:")
            print(result.stderr)
            return False
            
    except Exception as e:
        print(f"❌ Failed to run migrations: {e}")
        return False

def main():
    """Main initialization function"""
    print("🚀 Initializing OWOX Data Marts database...")
    
    # Debug: Print environment variables
    import os
    print(f"🔍 DATABASE_URL from env: {os.getenv('DATABASE_URL', 'NOT SET')}")
    print(f"🔍 REDIS_URL from env: {os.getenv('REDIS_URL', 'NOT SET')}")
    
    # Debug: Print settings
    try:
        from app.core.config import settings
        print(f"🔍 DATABASE_URL from settings: {settings.DATABASE_URL}")
    except Exception as e:
        print(f"❌ Failed to load settings: {e}")
    
    # Check if we need to generate initial migration
    if not check_migrations_exist():
        if not generate_initial_migration():
            print("❌ Failed to generate initial migration")
            sys.exit(1)
    else:
        print("✅ Migration files found")
    
    # Run migrations
    if not run_migrations():
        print("❌ Failed to run migrations")
        sys.exit(1)
    
    print("🎉 Database initialization completed successfully!")

if __name__ == "__main__":
    main()
