#!/bin/bash

echo "Starting OWOX Data Marts FastAPI backend..."

# Wait for database to be ready
echo "Waiting for database connection..."
while ! nc -z postgres 5432; do
  sleep 0.1
done
echo "Database is ready!"

# Initialize database tables using direct creation (bypass Alembic for now)
echo "Initializing database tables..."
python scripts/create_tables_direct.py

echo "Starting FastAPI server..."
# Start the FastAPI server
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
