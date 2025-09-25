# OWOX Data Marts - FastAPI Backend

A modern FastAPI backend for the OWOX Data Marts platform, providing secure platform credential management and progressive data collection capabilities.

## Features

- **FastAPI Framework**: Modern, fast web framework for building APIs
- **PostgreSQL Database**: Robust relational database with SQLAlchemy ORM
- **User Authentication**: JWT-based authentication system
- **Platform Credentials Management**: Secure storage and management of API credentials
- **Data Collection**: Progressive data collection from various marketing platforms
- **Async Support**: Full async/await support for better performance
- **API Documentation**: Auto-generated OpenAPI/Swagger documentation

## Supported Platforms

- Facebook Ads
- LinkedIn Ads
- TikTok Ads
- Google Ads
- And more...

## Quick Start

### Using Docker Compose (Recommended)

1. **Clone and navigate to the backend directory**:
   ```bash
   cd apps/fastapi-backend
   ```

2. **Copy environment file**:
   ```bash
   cp .env.example .env
   ```

3. **Start all services**:
   ```bash
   docker-compose up -d
   ```

4. **Run database migrations**:
   ```bash
   docker-compose exec fastapi alembic upgrade head
   ```

5. **Access the API**:
   - API: http://localhost:8000
   - Documentation: http://localhost:8000/docs
   - Alternative docs: http://localhost:8000/redoc

### Manual Setup

1. **Install Python 3.11+** and create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Set up PostgreSQL and Redis**:
   - Install PostgreSQL and create a database
   - Install Redis
   - Update `.env` with your database and Redis URLs

4. **Run database migrations**:
   ```bash
   alembic upgrade head
   ```

5. **Start the development server**:
   ```bash
   uvicorn app.main:app --reload
   ```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/owox_data_marts

# Security
SECRET_KEY=your-super-secret-key-change-this-in-production
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Redis (for background tasks)
REDIS_URL=redis://localhost:6379/0

# API Configuration
DEBUG=True
BACKEND_CORS_ORIGINS=["http://localhost:3000"]
```

## API Endpoints

### Authentication
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/register` - User registration

### Users
- `GET /api/v1/users/me` - Get current user
- `PUT /api/v1/users/me` - Update current user

### Platform Credentials
- `GET /api/v1/platform-credentials/` - List user's credentials
- `POST /api/v1/platform-credentials/` - Create new credential
- `GET /api/v1/platform-credentials/{id}` - Get credential details
- `PUT /api/v1/platform-credentials/{id}` - Update credential
- `DELETE /api/v1/platform-credentials/{id}` - Delete credential
- `POST /api/v1/platform-credentials/{id}/validate` - Validate credential

### Data Marts
- `GET /api/v1/data-marts/` - List user's data marts
- `POST /api/v1/data-marts/` - Create new data mart
- `GET /api/v1/data-marts/{id}` - Get data mart details
- `PUT /api/v1/data-marts/{id}` - Update data mart
- `DELETE /api/v1/data-marts/{id}` - Delete data mart

## Database Migrations

Create a new migration:
```bash
alembic revision --autogenerate -m "Description of changes"
```

Apply migrations:
```bash
alembic upgrade head
```

Rollback migration:
```bash
alembic downgrade -1
```

## Development

### Code Structure

```
app/
├── api/                 # API routes and endpoints
├── core/               # Core functionality (config, security)
├── crud/               # Database operations
├── database/           # Database configuration
├── models/             # SQLAlchemy models
├── schemas/            # Pydantic schemas
└── main.py            # FastAPI application
```

### Running Tests

```bash
pytest
```

### Code Quality

Format code:
```bash
black app/
isort app/
```

Lint code:
```bash
flake8 app/
```

## Security

- Passwords are hashed using bcrypt
- Platform credentials are encrypted before storage
- JWT tokens for authentication
- CORS protection
- Input validation with Pydantic

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

This project is licensed under the ELv2 License.
