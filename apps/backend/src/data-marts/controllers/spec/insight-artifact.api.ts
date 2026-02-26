import { applyDecorators } from '@nestjs/common';
import {
  ApiBody,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { CreateInsightArtifactRequestApiDto } from '../../dto/presentation/create-insight-artifact-request-api.dto';
import { InsightArtifactListItemResponseApiDto } from '../../dto/presentation/insight-artifact-list-item-response-api.dto';
import { InsightArtifactResponseApiDto } from '../../dto/presentation/insight-artifact-response-api.dto';
import { UpdateInsightArtifactRequestApiDto } from '../../dto/presentation/update-insight-artifact-request-api.dto';
import { UpdateInsightArtifactTitleApiDto } from '../../dto/presentation/update-insight-artifact-title-api.dto';

export function CreateInsightArtifactSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Create a new Insight Artifact' }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiBody({ type: CreateInsightArtifactRequestApiDto }),
    ApiResponse({ status: 201, type: InsightArtifactResponseApiDto })
  );
}

export function GetInsightArtifactSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get an Insight Artifact by ID' }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'insightArtifactId', description: 'Insight Artifact ID' }),
    ApiOkResponse({ type: InsightArtifactResponseApiDto })
  );
}

export function ListInsightArtifactsSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'List Insight Artifacts for a DataMart' }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiExtraModels(InsightArtifactListItemResponseApiDto),
    ApiOkResponse({
      schema: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: { $ref: getSchemaPath(InsightArtifactListItemResponseApiDto) },
          },
        },
      },
    })
  );
}

export function UpdateInsightArtifactSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Update Insight Artifact' }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'insightArtifactId', description: 'Insight Artifact ID' }),
    ApiBody({ type: UpdateInsightArtifactRequestApiDto }),
    ApiOkResponse({ type: InsightArtifactResponseApiDto })
  );
}

export function UpdateInsightArtifactTitleSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Update Insight Artifact title' }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'insightArtifactId', description: 'Insight Artifact ID' }),
    ApiBody({ type: UpdateInsightArtifactTitleApiDto }),
    ApiOkResponse({ type: InsightArtifactResponseApiDto })
  );
}

export function DeleteInsightArtifactSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Soft delete Insight Artifact' }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'insightArtifactId', description: 'Insight Artifact ID' }),
    ApiNoContentResponse({ description: 'Insight Artifact deleted' })
  );
}
