import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter, NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import { Express, text } from 'express';
import { initializeTransactionalContext, StorageDriver } from 'typeorm-transactional';
import { AppModule } from './app.module';
import { BaseExceptionFilter } from './common/exceptions/base-exception.filter';
import { GlobalExceptionFilter } from './common/exceptions/global-exception.filter';
import { createLogger } from './common/logger/logger.service';
import { DEFAULT_PORT } from './config/constants';
import { setupGlobalPipes } from './config/global-pipes.config';
import { runMigrationsIfNeeded } from './config/migrations.config';
import { setupSwagger } from './config/swagger.config';
import { loadEnv } from './load-env';

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

  app.use(
    compression({
      filter: (req, res) => {
        // Don't compress if the response is already custom-compressed(e.g., for looker)
        if (res.getHeader('Content-Encoding')) {
          return false;
        }
        return compression.filter(req, res);
      },
    })
  );

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
