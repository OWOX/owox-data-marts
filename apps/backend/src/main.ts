import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from '@nestjs/common';
import { setupSwagger } from './config/swagger.config';
import { setupGlobalPipes } from './config/global-pipes.config';
import { setupStaticAssets } from './config/express-static.config';

const logger = new Logger('Bootstrap');
const PATH_PREFIX = 'api';
const DEFAULT_PORT = 3000;

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix(PATH_PREFIX);
  setupGlobalPipes(app);
  setupSwagger(app);
  setupStaticAssets(app, PATH_PREFIX);

  await app.listen(process.env.PORT ? Number(process.env.PORT) : DEFAULT_PORT);
  logger.log(`Application is running on: ${await app.getUrl()}`);
}

bootstrap().catch((err: unknown) => {
  logger.error('Application failed to start', err instanceof Error ? err.stack : String(err));
});
