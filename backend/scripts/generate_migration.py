#!/usr/bin/env python3
"""
Generate initial Alembic migration
"""

import sys
import os
import subprocess

# Add the app directory to Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

def generate_migration():
    """Generate initial migration"""
    print("Generating initial Alembic migration...")
    
    # Change to backend directory
    backend_dir = os.path.dirname(os.path.dirname(__file__))
    os.chdir(backend_dir)
    
    try:
        # Generate migration
        result = subprocess.run([
            "alembic", "revision", "--autogenerate", 
            "-m", "Initial migration with all models"
        ], capture_output=True, text=True)
        
        if result.returncode == 0:
            print("Migration generated successfully!")
            print(result.stdout)
        else:
            print("Error generating migration:")
            print(result.stderr)
            return False
            
    except Exception as e:
        print(f"Failed to generate migration: {e}")
        return False
    
    return True

if __name__ == "__main__":
    generate_migration()
