import { Controller, Get, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApiExtraModels, ApiOkResponse, DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  BatchRunDataQualityResponseApiDto,
  DataQualityCheckResultResponseApiDto,
  DataQualityConfigResponseApiDto,
  DataQualityConfigValueApiDto,
  DataQualityRunResponseApiDto,
  LatestDataQualityRunResponseApiDto,
} from './data-quality-api.dto';

@Controller('data-quality-schema-test')
@ApiExtraModels(
  DataQualityConfigValueApiDto,
  DataQualityConfigResponseApiDto,
  LatestDataQualityRunResponseApiDto,
  DataQualityRunResponseApiDto,
  DataQualityCheckResultResponseApiDto,
  BatchRunDataQualityResponseApiDto
)
class DataQualitySchemaTestController {
  @Get()
  @ApiOkResponse({ type: DataQualityConfigResponseApiDto })
  getResponse(): DataQualityConfigResponseApiDto {
    throw new Error('Schema-only test controller');
  }
}

@Module({ controllers: [DataQualitySchemaTestController] })
class DataQualitySchemaTestModule {}

describe('Data Quality OpenAPI contracts', () => {
  it('publishes unversioned config, compact latest and explicit redaction schemas', async () => {
    const testingModule = await Test.createTestingModule({
      imports: [DataQualitySchemaTestModule],
    }).compile();
    const app = testingModule.createNestApplication();
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    await app.close();

    const schemas = document.components?.schemas as Record<
      string,
      { properties?: Record<string, unknown> }
    >;
    expect(schemas.DataQualityConfigValueApiDto.properties).toEqual(
      expect.objectContaining({ timezone: expect.any(Object), rules: expect.any(Object) })
    );
    expect(schemas.DataQualityConfigValueApiDto.properties).not.toHaveProperty('version');
    expect(schemas.LatestDataQualityRunResponseApiDto.properties).toEqual(
      expect.objectContaining({ runId: expect.any(Object), summary: expect.any(Object) })
    );
    expect(schemas.LatestDataQualityRunResponseApiDto.properties).not.toHaveProperty('results');
    expect(schemas.DataQualityCheckResultResponseApiDto.properties).toHaveProperty('redacted');
    expect(schemas.DataQualityConfigResponseApiDto.properties).toEqual(
      expect.objectContaining({ canEdit: expect.any(Object), canRun: expect.any(Object) })
    );
  });
});
