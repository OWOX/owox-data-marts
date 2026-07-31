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
  RunDataQualityRequestApiDto,
} from './data-quality-api.dto';
import {
  DataMartRunDetailResponseApiDto,
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
  RunDataQualityRequestApiDto,
  DataMartRunResponseApiDto,
  DataMartRunDetailResponseApiDto,
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
  it('publishes config, compact latest, and explicit redaction schemas', async () => {
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
      expect.objectContaining({ rules: expect.any(Object) })
    );
    expect(schemas.LatestDataQualityRunResponseApiDto.properties).toEqual(
      expect.objectContaining({ runId: expect.any(Object), summary: expect.any(Object) })
    );
    expect(schemas.LatestDataQualityRunResponseApiDto.properties).not.toHaveProperty('results');
    expect(schemas.DataMartRunResponseApiDto.properties).toHaveProperty('qualitySummary');
    expect(schemas.DataMartRunResponseApiDto.properties).not.toHaveProperty('dataQuality');
    expect(schemas.DataMartRunDetailResponseApiDto.properties).toHaveProperty('dataQuality');
    expect(schemas.ProjectDataMartRunResponseApiDto.properties).not.toHaveProperty('dataQuality');
    expect(schemas.DataMartRunsResponseApiDto.properties?.runs).toMatchObject({
      items: { $ref: expect.stringContaining('DataMartRunResponseApiDto') },
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
    expect(schemas.DataQualityRunSnapshotApiDto.properties).toHaveProperty('definitionType');
    expect(schemas.DataQualityRunSnapshotApiDto.properties).not.toHaveProperty('sourceStorage');
    expect(schemas.DataQualityRunSnapshotApiDto.properties).not.toHaveProperty(
      'relationshipTargets'
    );
    expect(schemas.DataQualityRunSnapshotApiDto.properties).not.toHaveProperty('technicalViews');
    expect(schemas.DataQualityRelationshipSnapshotApiDto.properties).not.toHaveProperty(
      'definition'
    );
    expect(schemas.DataQualityRelationshipSnapshotApiDto.properties).not.toHaveProperty('schema');
    expect(schemas.DataQualityRelationshipSnapshotApiDto.properties).not.toHaveProperty('storage');
    expect(schemas.DataQualityConfigResponseApiDto.properties).toEqual(
      expect.objectContaining({
        canEdit: expect.any(Object),
        canRun: expect.any(Object),
        configRevision: expect.objectContaining({ pattern: '^[0-9a-f]{64}$' }),
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
