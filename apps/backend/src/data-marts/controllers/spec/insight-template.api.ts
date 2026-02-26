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
import { CreateInsightTemplateRequestApiDto } from '../../dto/presentation/create-insight-template-request-api.dto';
import { InsightTemplateListItemResponseApiDto } from '../../dto/presentation/insight-template-list-item-response-api.dto';
import { InsightTemplateResponseApiDto } from '../../dto/presentation/insight-template-response-api.dto';
import { UpdateInsightTemplateRequestApiDto } from '../../dto/presentation/update-insight-template-request-api.dto';
import { UpdateInsightTemplateTitleApiDto } from '../../dto/presentation/update-insight-template-title-api.dto';

export function CreateInsightTemplateSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Create a new Insight Template' }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiBody({ type: CreateInsightTemplateRequestApiDto }),
    ApiResponse({ status: 201, type: InsightTemplateResponseApiDto })
  );
}

export function GetInsightTemplateSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get an Insight Template by ID' }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'insightTemplateId', description: 'Insight Template ID' }),
    ApiOkResponse({ type: InsightTemplateResponseApiDto })
  );
}

export function ListInsightTemplatesSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'List Insight Templates for a DataMart' }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiExtraModels(InsightTemplateListItemResponseApiDto),
    ApiOkResponse({
      schema: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: { $ref: getSchemaPath(InsightTemplateListItemResponseApiDto) },
          },
        },
      },
    })
  );
}

export function UpdateInsightTemplateSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Update Insight Template' }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'insightTemplateId', description: 'Insight Template ID' }),
    ApiBody({ type: UpdateInsightTemplateRequestApiDto }),
    ApiOkResponse({ type: InsightTemplateResponseApiDto })
  );
}

export function UpdateInsightTemplateTitleSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Update Insight Template title' }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'insightTemplateId', description: 'Insight Template ID' }),
    ApiBody({ type: UpdateInsightTemplateTitleApiDto }),
    ApiOkResponse({ type: InsightTemplateResponseApiDto })
  );
}

export function DeleteInsightTemplateSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Soft delete Insight Template' }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'insightTemplateId', description: 'Insight Template ID' }),
    ApiNoContentResponse({ description: 'Insight Template deleted' })
  );
}
