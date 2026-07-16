import { Controller, Get, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApiExtraModels, ApiOkResponse, DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  BatchRunDataQualityResponseApiDto,
  DataQualityCheckResultResponseApiDto,
  DataQualityConfigResponseApiDto,
  DataQualityConfigValueApiDto,
  DataQualityRunDetailsResponseApiDto,
  LatestDataQualityRunResponseApiDto,
} from './data-quality-api.dto';
import {
  DataMartRunListItemResponseApiDto,
  DataMartRunResponseApiDto,
} from './data-mart-run-response-api.dto';
import { DataMartRunsResponseApiDto } from './data-mart-runs-response-api.dto';
import {
  ProjectDataMartRunResponseApiDto,
  ProjectDataMartRunsResponseApiDto,
} from './project-data-mart-runs-response-api.dto';

@Controller('data-quality-schema-test')
@ApiExtraModels(
  DataQualityConfigValueApiDto,
  DataQualityConfigResponseApiDto,
  LatestDataQualityRunResponseApiDto,
  DataQualityRunDetailsResponseApiDto,
  DataQualityCheckResultResponseApiDto,
  BatchRunDataQualityResponseApiDto,
  DataMartRunResponseApiDto,
  DataMartRunListItemResponseApiDto,
  DataMartRunsResponseApiDto,
  ProjectDataMartRunResponseApiDto,
  ProjectDataMartRunsResponseApiDto
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
    expect(schemas.DataMartRunResponseApiDto.properties).toHaveProperty('dataQuality');
    expect(schemas.DataMartRunListItemResponseApiDto.properties).toHaveProperty('qualitySummary');
    expect(schemas.DataMartRunListItemResponseApiDto.properties).not.toHaveProperty('dataQuality');
    expect(schemas.ProjectDataMartRunResponseApiDto.properties).not.toHaveProperty('dataQuality');
    expect(schemas.DataMartRunsResponseApiDto.properties?.runs).toMatchObject({
      items: { $ref: expect.stringContaining('DataMartRunListItemResponseApiDto') },
    });
    expect(schemas.ProjectDataMartRunsResponseApiDto.properties?.runs).toMatchObject({
      items: { $ref: expect.stringContaining('ProjectDataMartRunResponseApiDto') },
    });
    expect(schemas.DataQualityRunDetailsResponseApiDto.properties).toEqual(
      expect.objectContaining({
        snapshot: expect.any(Object),
        summary: expect.any(Object),
        results: expect.any(Object),
      })
    );
    expect(schemas.DataQualityCheckResultResponseApiDto.properties).toHaveProperty('redacted');
    expect(schemas.DataQualityCheckResultResponseApiDto.properties).not.toHaveProperty(
      'dataQualityRunId'
    );
    expect(schemas.DataQualityRunSnapshotApiDto.properties).toHaveProperty('definitionType');
    expect(schemas.DataQualityConfigResponseApiDto.properties).toEqual(
      expect.objectContaining({
        canEdit: expect.any(Object),
        canRun: expect.any(Object),
        relationships: expect.any(Object),
      })
    );
    expect(schemas.DataQualityRelationshipMetadataApiDto.properties).toEqual(
      expect.objectContaining({
        id: expect.any(Object),
        targetAlias: expect.any(Object),
        joinConditions: expect.any(Object),
      })
    );
    expect(schemas.DataQualityRelationshipMetadataApiDto.properties).not.toHaveProperty(
      'targetDataMartId'
    );
    expect(schemas.DataQualityRelationshipJoinConditionApiDto.properties).toEqual(
      expect.objectContaining({
        sourceFieldName: expect.any(Object),
        targetFieldName: expect.any(Object),
      })
    );
  });
});
