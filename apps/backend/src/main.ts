import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { BaseExceptionFilter } from './common/exceptions/base-exception.filter';
import { configureExpressStatic } from './config/express-static.config';
import { setupGlobalPipes } from './config/global-pipes.config';
import { setupSwagger } from './config/swagger.config';

const logger = new Logger('Bootstrap');
const PATH_PREFIX = 'api';
const SWAGGER_PATH = 'swagger-ui';
const DEFAULT_PORT = 3000;

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.useGlobalFilters(new BaseExceptionFilter());
  app.setGlobalPrefix(PATH_PREFIX);
  setupGlobalPipes(app);
  setupSwagger(app, SWAGGER_PATH);
  configureExpressStatic(app);

  app.enableShutdownHooks();

  await app.listen(process.env.PORT ? Number(process.env.PORT) : DEFAULT_PORT);
  let appUrl = await app.getUrl();
  appUrl = appUrl.replace('[::1]', 'localhost');
  logger.log(`Application is running on: ${appUrl}`);
  logger.log(`Swagger is available at: ${appUrl}/${SWAGGER_PATH}`);
}

bootstrap().catch((err: unknown) => {
  logger.error('Application failed to start', err instanceof Error ? err.stack : String(err));
});
