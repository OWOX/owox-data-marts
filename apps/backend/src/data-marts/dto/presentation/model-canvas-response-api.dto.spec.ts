import { Controller, Get, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApiOkResponse, DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ModelCanvasDataMartsResponseApiDto } from './model-canvas-response-api.dto';

@Controller('model-canvas-schema-test')
class ModelCanvasSchemaTestController {
  @Get()
  @ApiOkResponse({ type: ModelCanvasDataMartsResponseApiDto })
  getResponse(): ModelCanvasDataMartsResponseApiDto {
    throw new Error('Schema-only test controller');
  }
}

@Module({ controllers: [ModelCanvasSchemaTestController] })
class ModelCanvasSchemaTestModule {}

describe('Model Canvas OpenAPI response schema', () => {
  it('describes nullable scalar fields as their scalar OpenAPI types', async () => {
    const testingModule = await Test.createTestingModule({
      imports: [ModelCanvasSchemaTestModule],
    }).compile();
    const app = testingModule.createNestApplication();
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    await app.close();

    expect(document.components?.schemas).toMatchObject({
      ModelCanvasNodeApiDto: {
        properties: {
          description: { type: 'string', nullable: true },
        },
      },
      ModelCanvasDataMartsResponseApiDto: {
        properties: {
          nextOffset: { type: 'number', nullable: true },
        },
      },
    });
  });
});
