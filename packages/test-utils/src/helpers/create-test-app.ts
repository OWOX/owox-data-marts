import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';

/**
 * Creates a fully bootstrapped NestJS test application with SQLite :memory: database.
 *
 * Returns the NestJS app instance and a supertest agent for making HTTP requests.
 * The app uses the real AppModule with all production modules, but backed by
 * an in-memory SQLite database with migrations applied.
 *
 * Note: Each test request that requires authentication should include:
 *   .set('x-owox-authorization', 'test-token')
 * NullIdpProvider accepts any token value.
 */
export async function createTestApp(): Promise<{
  app: INestApplication;
  agent: supertest.Agent;
}> {
  // Set env vars before anything else -- these are read by ConfigService and data-source-options.
  // WARNING: These mutations persist for the entire Node.js process. This is safe because
  // each Jest worker runs in a separate process and createTestApp() is always called first.
  process.env.DB_TYPE = 'sqlite';
  process.env.SQLITE_DB_PATH = ':memory:';
  process.env.RUN_MIGRATIONS = 'false';
  process.env.NODE_ENV = 'test';

  // All imports below resolve from the backend workspace to avoid module duplication.
  // Using require() with explicit paths ensures singleton consistency for typeorm,
  // typeorm-transactional, and other packages.
  const backendRoot = require.resolve('@owox/backend/package.json');
  const backendDir = require('path').dirname(backendRoot);

  const resolveFromBackend = (pkg: string) =>
    require(require.resolve(pkg, { paths: [backendDir] }));

  const typeormTransactional = resolveFromBackend('typeorm-transactional');
  const { DataSource } = resolveFromBackend('typeorm');
  const { ExpressAdapter } = resolveFromBackend('@nestjs/platform-express');
  const { Test } = resolveFromBackend('@nestjs/testing');
  const { IdpProtocolMiddleware, NullIdpProvider } = resolveFromBackend('@owox/idp-protocol');
  const express = resolveFromBackend('express');

  // Must happen before NestJS app creation (requirement INFR-02)
  // Uses a global singleton -- safe for parallel Jest workers (separate Node.js processes)
  typeormTransactional.initializeTransactionalContext({
    storageDriver: typeormTransactional.StorageDriver.AUTO,
  });

  // Set up express with NullIdpProvider (mirrors main.ts setup)
  const expressApp = (express.default || express)();
  const idpProvider = new NullIdpProvider();
  await idpProvider.initialize();
  expressApp.set('idp', idpProvider);
  const middleware = new IdpProtocolMiddleware(idpProvider);
  middleware.register(expressApp);

  // Dynamically import AppModule to ensure env vars are set before module resolution
  const { AppModule } = await import(
    /* webpackIgnore: true */ '../../../../apps/backend/src/app.module'
  );

  // Import setupGlobalPipes from the backend config
  const { setupGlobalPipes } = await import(
    /* webpackIgnore: true */ '../../../../apps/backend/src/config/global-pipes.config'
  );

  // Import exception filters to match production behavior (registered in bootstrap.ts)
  const { GlobalExceptionFilter } = await import(
    /* webpackIgnore: true */ '../../../../apps/backend/src/common/exceptions/global-exception.filter'
  );
  const { BaseExceptionFilter } = await import(
    /* webpackIgnore: true */ '../../../../apps/backend/src/common/exceptions/base-exception.filter'
  );

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app: INestApplication = moduleRef.createNestApplication(
    new ExpressAdapter(expressApp)
  );
  app.setGlobalPrefix('api');
  setupGlobalPipes(app);
  app.useGlobalFilters(new GlobalExceptionFilter(), new BaseExceptionFilter());

  // Run migrations BEFORE app.init() because OnModuleInit hooks (e.g., SystemTriggerHandlerService)
  // query the database during init. Without tables, those queries fail.
  const dataSource = moduleRef.get(DataSource);
  await dataSource.query('PRAGMA foreign_keys = ON'); // requirement INFR-03
  await dataSource.runMigrations(); // use real migrations to match production behavior

  await app.init();

  const agent = supertest.default(app.getHttpServer());

  return { app, agent };
}

/**
 * Closes the test application and cleans up resources.
 */
export async function closeTestApp(app: INestApplication): Promise<void> {
  await app.close();
}
