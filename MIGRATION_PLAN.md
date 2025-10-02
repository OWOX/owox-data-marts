# OWOX Data Marts Migration Plan
## From NestJS + React to FastAPI + Next.js

### Current State Analysis
Based on inspection of the base folder, the original system consists of:

#### Backend (NestJS)
- **Core Modules:**
  - Data Marts Module (317 files)
  - IDP Module (Authentication/Authorization)
  - Common Module (Middleware, Scheduler, Logger)
  - Config Module

- **Entities (8 core database models):**
  1. DataMart
  2. DataStorage
  3. DataDestination
  4. DataMartRun
  5. DataMartScheduledTrigger
  6. Report
  7. ReportDataCache
  8. ConnectorState

- **Connector System:**
  - 12 Source Connectors (BankOfCanada, BingAds, CriteoAds, FacebookMarketing, GitHub, LinkedInAds, LinkedInPages, OpenExchangeRates, OpenHolidays, RedditAds, TikTokAds, XAds)
  - Connector Runner (separate module)
  - Connector Message System
  - Connector State Management

- **Storage Types:**
  - BigQuery
  - Athena
  - Storage Facades and Providers

- **Services Architecture:**
  - 40+ Use Case Services
  - 10+ Domain Services
  - Mappers for DTOs
  - Controllers for REST APIs

#### Frontend (React + Vite)
- 521 feature files
- 27 components
- 18 pages
- Routing system
- Services layer

## Detailed Migration Steps

### Phase 1: Foundation Setup (Week 1-2)

#### 1.1 Database Models and Migrations
**Priority: HIGH**
**Status: Pending**

Create SQLAlchemy models for all 8 core entities:

```python
# backend/app/models/
- data_mart.py (extend existing)
- data_storage.py (new)
- data_destination.py (new)
- data_mart_run.py (new)
- data_mart_scheduled_trigger.py (new)
- report.py (extend existing)
- report_data_cache.py (new)
- connector_state.py (new)
```

Tasks:
- [ ] Create all SQLAlchemy models with proper relationships
- [ ] Generate Alembic migrations
- [ ] Add proper indexes and constraints
- [ ] Implement soft delete functionality
- [ ] Add audit fields (created_at, updated_at, deleted_at)

#### 1.2 Authentication & Authorization (IDP Module)
**Priority: HIGH**
**Status: Pending**

Implement complete authentication system:

```python
# backend/app/auth/
- idp_provider.py
- idp_guard.py (decorator)
- idp_exceptions.py
- jwt_handler.py
- permissions.py
```

Tasks:
- [ ] Implement JWT authentication
- [ ] Create role-based access control (RBAC)
- [ ] Add API key authentication for connectors
- [ ] Implement session management
- [ ] Add OAuth2 support

#### 1.3 Core Configuration
**Priority: HIGH**
**Status: Pending**

Setup configuration management:

```python
# backend/app/core/
- config.py (extend existing)
- database.py (extend existing)
- exceptions.py
- middleware.py
- logging.py
```

Tasks:
- [ ] Environment-based configuration
- [ ] Database connection pooling
- [ ] Redis configuration for caching/queues
- [ ] Logging configuration
- [ ] Error handling middleware

### Phase 2: Data Marts Core (Week 2-3)

#### 2.1 Data Marts Module
**Priority: HIGH**
**Status: Pending**

Implement core data marts functionality:

```python
# backend/app/services/data_marts/
- data_mart_service.py
- data_mart_mapper.py
- data_mart_validator.py

# backend/app/use_cases/data_marts/
- create_data_mart.py
- update_data_mart.py
- delete_data_mart.py
- list_data_marts.py
- get_data_mart.py
- publish_data_mart.py
- validate_definition.py
- actualize_schema.py
```

Tasks:
- [ ] CRUD operations for data marts
- [ ] Definition validation
- [ ] Schema management
- [ ] Status management (DRAFT, PUBLISHED, etc.)
- [ ] SQL dry-run functionality

#### 2.2 Data Storage Implementation
**Priority: HIGH**
**Status: Pending**

Implement storage types and facades:

```python
# backend/app/storage_types/
- bigquery/
  - bigquery_facade.py
  - bigquery_config.py
  - bigquery_credentials.py
  - bigquery_service.py
- athena/
  - athena_facade.py
  - athena_config.py
  - athena_credentials.py
  - athena_service.py
- base/
  - storage_facade.py
  - storage_provider.py
```

Tasks:
- [ ] BigQuery integration
- [ ] Athena integration
- [ ] Storage facade pattern
- [ ] Credentials management
- [ ] Connection pooling

#### 2.3 Data Destination Implementation
**Priority: HIGH**
**Status: Pending**

Implement destination types:

```python
# backend/app/destination_types/
- base_destination.py
- destination_facade.py
- destination_provider.py
- secret_key_rotator.py
```

Tasks:
- [ ] Destination facades
- [ ] Secret key rotation
- [ ] Destination validation
- [ ] Connection testing

### Phase 3: Connector System (Week 3-4)

#### 3.1 Connector Architecture
**Priority: HIGH**
**Status: Pending**

Build connector infrastructure:

```python
# backend/app/connectors/
- base_connector.py
- connector_runner.py
- connector_executor.py
- connector_registry.py

# backend/app/connectors/sources/
- bank_of_canada/
- bing_ads/
- criteo_ads/
- facebook_marketing/
- github/
- linkedin_ads/
- linkedin_pages/
- open_exchange_rates/
- open_holidays/
- reddit_ads/
- tiktok_ads/
- x_ads/
```

Tasks:
- [ ] Base connector class
- [ ] Connector registry system
- [ ] Connector execution service
- [ ] Error handling and retry logic
- [ ] Rate limiting

#### 3.2 Connector Runner Service
**Priority: HIGH**
**Status: Pending**

Implement connector runner:

```python
# backend/app/services/connector_runner/
- runner_service.py
- execution_service.py
- message_parser.py
- output_capture.py
- state_manager.py
```

Tasks:
- [ ] Async execution with Celery
- [ ] Output streaming
- [ ] State management
- [ ] Progress tracking
- [ ] Cancellation support

#### 3.3 Connector Message System
**Priority: MEDIUM**
**Status: Pending**

Implement message handling:

```python
# backend/app/connectors/messages/
- message_types.py
- message_parser.py
- output_handler.py
- error_handler.py
```

Tasks:
- [ ] Message type definitions
- [ ] Parsing and validation
- [ ] Output capture
- [ ] Error aggregation

### Phase 4: Scheduling & Background Tasks (Week 4-5)

#### 4.1 Scheduled Triggers
**Priority: MEDIUM**
**Status: Pending**

Implement scheduling system:

```python
# backend/app/schedulers/
- trigger_types.py
- trigger_service.py
- trigger_handler.py
- cron_parser.py
```

Tasks:
- [ ] Cron-based scheduling
- [ ] Trigger types (14 types from base)
- [ ] Schedule validation
- [ ] Execution history

#### 4.2 Background Task Processing
**Priority: HIGH**
**Status: Pending**

Setup Celery for async tasks:

```python
# backend/app/tasks/
- celery_app.py
- data_mart_tasks.py
- connector_tasks.py
- report_tasks.py
- cleanup_tasks.py
```

Tasks:
- [ ] Celery configuration
- [ ] Task queues setup
- [ ] Task monitoring
- [ ] Dead letter queue
- [ ] Task retries

### Phase 5: Reports & Caching (Week 5)

#### 5.1 Report System
**Priority: MEDIUM**
**Status: Pending**

Implement reporting:

```python
# backend/app/services/reports/
- report_service.py
- report_executor.py
- report_cache_service.py
```

Tasks:
- [ ] Report CRUD operations
- [ ] Report execution
- [ ] Result caching
- [ ] Export functionality

#### 5.2 Caching Layer
**Priority: MEDIUM**
**Status: Pending**

Implement Redis caching:

```python
# backend/app/cache/
- redis_client.py
- cache_service.py
- cache_decorators.py
```

Tasks:
- [ ] Redis setup
- [ ] Cache strategies
- [ ] Cache invalidation
- [ ] TTL management

### Phase 6: API Routes & Controllers (Week 5-6)

#### 6.1 REST API Implementation
**Priority: HIGH**
**Status: Pending**

Create all API endpoints:

```python
# backend/app/api/api_v1/endpoints/
- data_marts.py
- data_storage.py
- data_destinations.py
- reports.py
- connectors.py
- scheduled_triggers.py
- auth.py
```

Tasks:
- [ ] RESTful endpoints
- [ ] Request validation
- [ ] Response formatting
- [ ] Error handling
- [ ] API documentation (OpenAPI)

#### 6.2 WebSocket Support
**Priority: LOW**
**Status: Pending**

Real-time updates:

```python
# backend/app/websockets/
- connection_manager.py
- event_handlers.py
- broadcast_service.py
```

Tasks:
- [ ] WebSocket server
- [ ] Event broadcasting
- [ ] Connection management
- [ ] Authentication

### Phase 7: Frontend Migration (Week 6-8)

#### 7.1 Core Components
**Priority: MEDIUM**
**Status: Pending**

Migrate React components to Next.js:

```typescript
// frontend/src/components/
- DataMartList/
- DataMartForm/
- ConnectorConfig/
- StorageConfig/
- ReportBuilder/
- ScheduleTrigger/
```

Tasks:
- [ ] Component migration
- [ ] State management (Redux/Zustand)
- [ ] API integration
- [ ] Form handling
- [ ] Data tables

#### 7.2 Pages & Routing
**Priority: MEDIUM**
**Status: Pending**

Implement Next.js pages:

```typescript
// frontend/src/app/
- data-marts/
  - page.tsx
  - [id]/page.tsx
  - create/page.tsx
- connectors/
  - page.tsx
  - [type]/page.tsx
- reports/
  - page.tsx
  - [id]/page.tsx
- settings/
  - page.tsx
```

Tasks:
- [ ] Page structure
- [ ] Dynamic routing
- [ ] Server-side rendering
- [ ] Client-side navigation

#### 7.3 UI Features
**Priority: MEDIUM**
**Status: Pending**

Implement UI features:

Tasks:
- [ ] Dashboard
- [ ] Data visualization
- [ ] Real-time updates
- [ ] Notifications
- [ ] File uploads
- [ ] Export functionality

### Phase 8: Testing & Documentation (Week 8-9)

#### 8.1 Testing Infrastructure
**Priority: LOW**
**Status: Pending**

Setup testing:

```python
# backend/tests/
- unit/
- integration/
- e2e/
```

Tasks:
- [ ] Unit tests
- [ ] Integration tests
- [ ] E2E tests
- [ ] Test coverage
- [ ] CI/CD integration

#### 8.2 Documentation
**Priority: LOW**
**Status: Pending**

Create documentation:

Tasks:
- [ ] API documentation
- [ ] Developer guide
- [ ] User manual
- [ ] Deployment guide
- [ ] Migration guide

### Phase 9: Deployment & DevOps (Week 9-10)

#### 9.1 Containerization
**Priority: LOW**
**Status: Pending**

Docker setup:

Tasks:
- [ ] Dockerfile for backend
- [ ] Dockerfile for frontend
- [ ] Docker Compose
- [ ] Environment management

#### 9.2 CI/CD Pipeline
**Priority: LOW**
**Status: Pending**

Setup automation:

Tasks:
- [ ] GitHub Actions
- [ ] Automated testing
- [ ] Build pipeline
- [ ] Deployment automation

## Implementation Order

### Critical Path (Must Complete First):
1. Database Models & Migrations
2. Authentication System
3. Data Marts Core Services
4. Connector Architecture
5. API Routes
6. Background Task Processing

### Secondary Features:
1. Scheduled Triggers
2. Report System
3. Caching Layer
4. Frontend Migration

### Nice to Have:
1. WebSocket Support
2. Advanced UI Features
3. Complete Test Coverage
4. Full Documentation

## Risk Mitigation

### Technical Risks:
1. **Connector Compatibility**: May need to rewrite connectors in Python
2. **Performance**: Ensure FastAPI matches NestJS performance
3. **State Management**: Complex state transitions need careful handling
4. **Data Migration**: Existing data needs migration scripts

### Mitigation Strategies:
1. Incremental migration with feature flags
2. Parallel running of old and new systems
3. Comprehensive testing at each phase
4. Rollback procedures for each component

## Success Criteria

### Phase 1 Complete When:
- All database models created
- Authentication working
- Basic CRUD operations functional

### Phase 2 Complete When:
- Data marts fully functional
- Storage integration working
- Destinations configured

### Phase 3 Complete When:
- All connectors migrated
- Connector runner operational
- Message system working

### Final Success:
- Feature parity with NestJS system
- All tests passing
- Performance benchmarks met
- Successfully deployed to production

## Timeline Summary

- **Week 1-2**: Foundation (Database, Auth, Config)
- **Week 2-3**: Data Marts Core
- **Week 3-4**: Connector System
- **Week 4-5**: Scheduling & Background Tasks
- **Week 5-6**: API & Reports
- **Week 6-8**: Frontend Migration
- **Week 8-9**: Testing & Documentation
- **Week 9-10**: Deployment & Optimization

Total Estimated Time: **10 weeks** for full migration

## Next Steps

1. Start with database models migration
2. Implement authentication system
3. Begin core data marts services
4. Migrate connectors one by one
5. Implement API endpoints
6. Setup background processing
7. Migrate frontend components
8. Complete testing and deployment
