import { loadEnv } from './load-env';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { createLogger } from './common/logger/logger.service';
import { setupSwagger } from './config/swagger.config';
import { setupGlobalPipes } from './config/global-pipes.config';
import { setupStaticAssets } from './config/express-static.config';
import { BaseExceptionFilter } from './common/exceptions/base-exception.filter';
import { ConfigService } from '@nestjs/config';
import { runMigrationsIfNeeded } from './config/migrations.config';

const logger = createLogger('Bootstrap');
const PATH_PREFIX = 'api';
const SWAGGER_PATH = 'swagger-ui';
const DEFAULT_PORT = 3000;

async function bootstrap() {
  loadEnv();
  const configService = new ConfigService();

  await runMigrationsIfNeeded(configService);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger,
  });

  app.useLogger(createLogger());
  app.useGlobalFilters(new BaseExceptionFilter());
  app.setGlobalPrefix(PATH_PREFIX);
  setupGlobalPipes(app);
  setupSwagger(app, SWAGGER_PATH);
  setupStaticAssets(app, PATH_PREFIX);

  app.enableShutdownHooks();

  await app.listen(configService.get<number>('PORT') ?? DEFAULT_PORT);
  let appUrl = await app.getUrl();
  appUrl = appUrl.replace('[::1]', 'localhost');
  logger.log(`Application is running on: ${appUrl}`);
  logger.log(`Swagger is available at: ${appUrl}/${SWAGGER_PATH}`);
}

bootstrap().catch((err: unknown) => {
  logger.error('Application failed to start', err instanceof Error ? err.stack : String(err));
});
