import { INestApplication } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication, path: string): void {
  const config = new DocumentBuilder()
    .setTitle('Backend API')
    .setDescription('REST API used by frontend clients and service integrations.')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(path, app, document, {
    useGlobalPrefix: false,
  });
}
