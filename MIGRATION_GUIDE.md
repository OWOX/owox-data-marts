# OWOX Data Marts Migration Guide

## FastAPI Backend + Next.js Frontend + PostgreSQL

This guide explains the migration from the original NestJS + React architecture to the new FastAPI + Next.js + PostgreSQL stack.

## 🎯 Migration Overview

### What Changed

**Backend Migration:**
- **From:** NestJS with TypeORM (SQLite/MySQL)
- **To:** FastAPI with SQLAlchemy (PostgreSQL)
- **Benefits:** Better performance, simpler architecture, native async support

**Frontend Migration:**
- **From:** React + Vite
- **To:** Next.js 14 with App Router
- **Benefits:** Better SEO, server-side rendering, improved developer experience

**Database Migration:**
- **From:** SQLite/MySQL with TypeORM
- **To:** PostgreSQL with SQLAlchemy + Alembic
- **Benefits:** Better scalability, advanced features, robust data integrity

## 🚀 Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 15+
- Redis (for background tasks)

### 1. Backend Setup (FastAPI)

```bash
# Navigate to FastAPI backend
cd apps/fastapi-backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set up environment
cp .env.example .env
# Edit .env with your database credentials

# Start PostgreSQL and Redis (using Docker)
docker-compose up -d postgres redis

# Run database migrations
alembic upgrade head

# Start the FastAPI server
uvicorn app.main:app --reload
```

The API will be available at: http://localhost:8000
API Documentation: http://localhost:8000/docs

### 2. Frontend Setup (Next.js)

```bash
# Navigate to Next.js frontend
cd apps/nextjs-frontend

# Install dependencies
npm install

# Set up environment
cp .env.example .env.local

# Start the development server
npm run dev
```

The frontend will be available at: http://localhost:3000

## 🔄 Data Migration

### Migrating Existing Data

If you have existing data in the old system, follow these steps:

1. **Export data from the old system:**
   ```bash
   # From the old backend directory
   npm run dump:create
   ```

2. **Transform data for new schema:**
   ```python
   # Run the migration script (to be created)
   python scripts/migrate_data.py
   ```

3. **Import data to PostgreSQL:**
   ```bash
   # From FastAPI backend directory
   python scripts/import_data.py
   ```

## 🏗️ Architecture Comparison

### Old Architecture (NestJS + React)

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React + Vite  │    │     NestJS      │    │  SQLite/MySQL   │
│                 │◄──►│                 │◄──►│                 │
│  - Components   │    │  - Controllers  │    │  - TypeORM      │
│  - State Mgmt   │    │  - Services     │    │  - Entities     │
│  - API Calls    │    │  - Modules      │    │  - Migrations   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### New Architecture (FastAPI + Next.js)

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    Next.js 14   │    │     FastAPI     │    │   PostgreSQL    │
│                 │◄──►│                 │◄──►│                 │
│  - App Router   │    │  - Routers      │    │  - SQLAlchemy   │
│  - Components   │    │  - Dependencies │    │  - Alembic      │
│  - React Query  │    │  - CRUD Ops     │    │  - Models       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                ▲
                                │
                       ┌─────────────────┐
                       │      Redis      │
                       │                 │
                       │  - Caching      │
                       │  - Background   │
                       │    Tasks        │
                       └─────────────────┘
```

## 🔑 Key Features

### Enhanced Platform Credentials Management

**New Features:**
- Encrypted credential storage using Fernet encryption
- Platform-specific validation
- Credential health monitoring
- Automatic token refresh (where supported)
- Granular permission management

**Supported Platforms:**
- Facebook Ads (Marketing API)
- LinkedIn Ads (Campaign Manager API)
- TikTok Ads (Marketing API)
- Google Ads (Google Ads API)

### Progressive Data Collection

**Improvements:**
- Real-time collection status tracking
- Progress indicators with detailed metrics
- Error handling and retry mechanisms
- Flexible scheduling with cron expressions
- Background processing with Celery

### Modern UI/UX

**Next.js Frontend Features:**
- Server-side rendering for better performance
- Responsive design with Tailwind CSS
- Real-time updates with React Query
- Accessible components with Headless UI
- Form validation with React Hook Form + Zod

## 🔐 Security Enhancements

### Backend Security
- JWT authentication with configurable expiration
- Password hashing with bcrypt
- Credential encryption with Fernet
- CORS protection
- Input validation with Pydantic
- SQL injection prevention with SQLAlchemy

### Frontend Security
- Secure token storage
- Automatic token refresh
- Protected routes
- CSRF protection
- XSS prevention

## 📊 Performance Improvements

### Backend Performance
- **FastAPI**: Native async support, faster than NestJS
- **PostgreSQL**: Better performance for complex queries
- **Connection pooling**: Efficient database connections
- **Caching**: Redis for frequently accessed data

### Frontend Performance
- **Next.js**: Server-side rendering and static generation
- **Code splitting**: Automatic bundle optimization
- **Image optimization**: Built-in Next.js image optimization
- **Caching**: React Query for intelligent data caching

## 🧪 Testing

### Backend Testing
```bash
cd apps/fastapi-backend
pytest
```

### Frontend Testing
```bash
cd apps/nextjs-frontend
npm run test
```

## 🚀 Deployment

### Using Docker Compose

```bash
# Start all services
docker-compose up -d

# Check logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Manual Deployment

1. **Deploy PostgreSQL database**
2. **Deploy FastAPI backend** (e.g., using Gunicorn + Nginx)
3. **Deploy Next.js frontend** (e.g., using Vercel or custom server)
4. **Set up Redis** for background tasks

## 🔧 Configuration

### Environment Variables

**Backend (.env):**
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/owox_data_marts
SECRET_KEY=your-secret-key
REDIS_URL=redis://localhost:6379/0
```

**Frontend (.env.local):**
```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

## 📈 Monitoring and Logging

### Backend Monitoring
- FastAPI automatic metrics
- PostgreSQL query logging
- Redis monitoring
- Custom application logs

### Frontend Monitoring
- Next.js analytics
- Error boundary reporting
- Performance monitoring
- User interaction tracking

## 🤝 Contributing

1. Follow the existing code style
2. Add tests for new features
3. Update documentation
4. Submit pull requests with clear descriptions

## 📚 Additional Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Next.js Documentation](https://nextjs.org/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [SQLAlchemy Documentation](https://docs.sqlalchemy.org/)
- [Alembic Documentation](https://alembic.sqlalchemy.org/)

## 🆘 Troubleshooting

### Common Issues

1. **Database connection errors**: Check PostgreSQL is running and credentials are correct
2. **CORS errors**: Verify BACKEND_CORS_ORIGINS includes your frontend URL
3. **Authentication issues**: Check JWT secret key configuration
4. **Migration errors**: Ensure database schema is up to date

### Getting Help

- Check the logs: `docker-compose logs`
- Review the API documentation: http://localhost:8000/docs
- Open an issue on GitHub with detailed error information
