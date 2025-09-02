import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ExpressAdapter } from '@nestjs/platform-express';
import { createLogger } from './common/logger/logger.service';
import { setupSwagger } from './config/swagger.config';
import { setupGlobalPipes } from './config/global-pipes.config';
import { BaseExceptionFilter } from './common/exceptions/base-exception.filter';
import { ConfigService } from '@nestjs/config';
import { runMigrationsIfNeeded } from './config/migrations.config';
import { loadEnv } from './load-env';
import { Express, text } from 'express';
import { AppModule } from './app.module';

const logger = createLogger('Bootstrap');
const PATH_PREFIX = 'api';
const SWAGGER_PATH = 'swagger-ui';
const DEFAULT_PORT = 3000;

export interface BootstrapOptions {
  express: Express;
  port?: number;
  logFormat?: string;
  webEnabled?: boolean;
}

export async function bootstrap(options: BootstrapOptions): Promise<NestExpressApplication> {
  // Load env if not already loaded
  loadEnv();

  const configService = new ConfigService();

  await runMigrationsIfNeeded(configService);

  // Create NestJS app with existing Express instance using ExpressAdapter
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(options.express),
    {
      logger,
    }
  );

  app.useLogger(createLogger());
  app.useGlobalFilters(new BaseExceptionFilter());
  app.setGlobalPrefix(PATH_PREFIX);

  app.use(text({ type: 'application/jwt' }));

  setupGlobalPipes(app);
  setupSwagger(app, SWAGGER_PATH);

  app.enableShutdownHooks();

  const port = options.port ?? configService.get<number>('PORT') ?? DEFAULT_PORT;
  await app.listen(port);

  const appUrl = await app.getUrl();
  const normalizedUrl = appUrl.replace('[::1]', 'localhost');

  logger.log(`Application is running on: ${normalizedUrl}`);
  logger.log(`Swagger is available at: ${normalizedUrl}/${SWAGGER_PATH}`);

  return app;
}
