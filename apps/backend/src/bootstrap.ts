import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ExpressAdapter } from '@nestjs/platform-express';
import { createLogger } from './common/logger/logger.service';
import { setupSwagger } from './config/swagger.config';
import { setupGlobalPipes } from './config/global-pipes.config';
import { BaseExceptionFilter } from './common/exceptions/base-exception.filter';
import { GlobalExceptionFilter } from './common/exceptions/global-exception.filter';
import { ConfigService } from '@nestjs/config';
import { runMigrationsIfNeeded } from './config/migrations.config';
import { loadEnv } from './load-env';
import { Express, text } from 'express';
import { AppModule } from './app.module';
import { DEFAULT_PORT } from './config/constants';
import { initializeTransactionalContext, StorageDriver } from 'typeorm-transactional';

const logger = createLogger('Bootstrap');
const PATH_PREFIX = 'api';
const SWAGGER_PATH = 'swagger-ui';

export interface BootstrapOptions {
  express: Express;
}

export async function bootstrap(options: BootstrapOptions): Promise<NestExpressApplication> {
  // Load env if not already loaded
  loadEnv();

  // Run migrations if needed
  await runMigrationsIfNeeded();

  initializeTransactionalContext({ storageDriver: StorageDriver.AUTO });

  // Create NestJS app with existing Express instance using ExpressAdapter
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(options.express),
    { logger }
  );

  app.useLogger(createLogger());
  app.useGlobalFilters(new GlobalExceptionFilter(), new BaseExceptionFilter());
  app.setGlobalPrefix(PATH_PREFIX);

  app.use(text({ type: 'application/jwt' }));

  setupGlobalPipes(app);
  setupSwagger(app, SWAGGER_PATH);

  app.enableShutdownHooks();

  // Get ConfigService from the DI container to ensure it has access to all env variables
  const appConfigService = app.get(ConfigService);
  const port = appConfigService.get<number>('PORT') || DEFAULT_PORT;

  const server = await app.listen(port);
  server.setTimeout(appConfigService.getOrThrow<number>('SERVER_TIMEOUT_MS'));
  server.keepAliveTimeout = appConfigService.getOrThrow<number>('KEEP_ALIVE_TIMEOUT_MS');
  server.headersTimeout = appConfigService.getOrThrow<number>('HEADERS_TIMEOUT_MS');

  const appUrl = await app.getUrl();
  const normalizedUrl = appUrl.replace('[::1]', 'localhost');

  logger.log(`Application is running on: ${normalizedUrl}`);
  logger.log(`Swagger is available at: ${normalizedUrl}/${SWAGGER_PATH}`);

  return app;
}
