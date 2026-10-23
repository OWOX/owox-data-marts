import { Controller, Put } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApiBody, ApiOkResponse, DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { DataMartResponseApiDto } from './data-mart-response-api.dto';
import { UpdateDataMartDescriptionApiDto } from './update-data-mart-description-api.dto';
import { CreateContextRequestApiDto, UpdateContextRequestApiDto } from './context-api.dto';

@Controller('data-mart-description-schema-test')
class DataMartDescriptionSchemaTestController {
  @Put()
  @ApiBody({ type: UpdateDataMartDescriptionApiDto })
  @ApiOkResponse({ type: DataMartResponseApiDto })
  update(): void {}
}

describe('Data Mart description OpenAPI contract', () => {
  it('describes nullable descriptions as strings for both requests and responses', async () => {
    const module = await Test.createTestingModule({
      controllers: [DataMartDescriptionSchemaTestController],
    }).compile();
    const app = module.createNestApplication();
    try {
      const document = SwaggerModule.createDocument(app, new DocumentBuilder().build(), {
        extraModels: [CreateContextRequestApiDto, UpdateContextRequestApiDto],
      });
      expect(document.components?.schemas).toMatchObject({
        UpdateDataMartDescriptionApiDto: {
          properties: { description: { type: 'string', nullable: true } },
        },
        DataMartResponseApiDto: {
          properties: { description: { type: 'string', nullable: true } },
        },
        CreateContextRequestApiDto: {
          properties: { description: { type: 'string', nullable: true } },
        },
        UpdateContextRequestApiDto: {
          properties: { description: { type: 'string', nullable: true } },
        },
      });
    } finally {
      await app.close();
    }
  });
});
