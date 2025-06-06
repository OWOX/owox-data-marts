import { ValidationPipe } from '@nestjs/common';
import { INestApplication } from '@nestjs/common';

export function setupGlobalPipes(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );
}
