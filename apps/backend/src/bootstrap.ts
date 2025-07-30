import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ExpressAdapter } from '@nestjs/platform-express';
import { createLogger } from './common/logger/logger.service';
import { setupSwagger } from './config/swagger.config';
import { setupGlobalPipes } from './config/global-pipes.config';
import { setupStaticAssets } from './config/express-static.config';
import { BaseExceptionFilter } from './common/exceptions/base-exception.filter';
import { ConfigService } from '@nestjs/config';
import { runMigrationsIfNeeded } from './config/migrations.config';
import { loadEnv } from './load-env';
import { setupIdp } from './config/idp.config';
import { Express } from 'express';

const logger = createLogger('Bootstrap');
const PATH_PREFIX = 'api';
const SWAGGER_PATH = 'swagger-ui';
const DEFAULT_PORT = 3000;

export interface BootstrapOptions {
  express: Express;
  port?: number;
  logFormat?: string;
  idpProvider?: string;
  webEnabled?: boolean;
}

export async function bootstrap(options: BootstrapOptions): Promise<NestExpressApplication> {
  // Load env if not already loaded
  loadEnv();

  const configService = new ConfigService();

  // Override env vars with options
  if (options.port) process.env.PORT = options.port.toString();
  if (options.logFormat) process.env.LOG_FORMAT = options.logFormat;
  if (options.idpProvider) process.env.IDP_PROVIDER = options.idpProvider;
  if (options.webEnabled !== undefined) process.env.WEB_ENABLED = options.webEnabled.toString();

  await runMigrationsIfNeeded(configService);

  // Import existing AppModule
  const { AppModule } = await import('./app.module');

  // Create NestJS app with existing Express instance using ExpressAdapter
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(options.express),
    {
      logger,
      bufferLogs: true,
    }
  );

  app.useLogger(createLogger());
  app.useGlobalFilters(new BaseExceptionFilter());
  app.setGlobalPrefix(PATH_PREFIX);
  setupGlobalPipes(app);
  setupSwagger(app, SWAGGER_PATH);

  await setupIdp(app);
  setupStaticAssets(app, PATH_PREFIX);

  app.enableShutdownHooks();

  const port = options.port ?? configService.get<number>('PORT') ?? DEFAULT_PORT;
  await app.listen(port);

  const appUrl = await app.getUrl();
  const normalizedUrl = appUrl.replace('[::1]', 'localhost');

  logger.log(`Application is running on: ${normalizedUrl}`);
  logger.log(`Swagger is available at: ${normalizedUrl}/${SWAGGER_PATH}`);

  return app;
}
