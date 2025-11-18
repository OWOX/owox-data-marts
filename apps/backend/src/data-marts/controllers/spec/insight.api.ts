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
import { CreateInsightRequestApiDto } from '../../dto/presentation/create-insight-request-api.dto';
import { InsightListItemResponseApiDto } from '../../dto/presentation/insight-list-item-response-api.dto';
import { InsightResponseApiDto } from '../../dto/presentation/insight-response-api.dto';
import { RunInsightResponseApiDto } from '../../dto/presentation/run-insight-response-api.dto';
import { UpdateInsightRequestApiDto } from '../../dto/presentation/update-insight-request-api.dto';
import { UpdateInsightTitleApiDto } from '../../dto/presentation/update-insight-title-api.dto';

export function CreateInsightSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Create a new Insight' }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiBody({ type: CreateInsightRequestApiDto }),
    ApiResponse({ status: 201, type: InsightResponseApiDto })
  );
}

export function GetInsightSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get an Insight by ID' }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'insightId', description: 'Insight ID' }),
    ApiOkResponse({ type: InsightResponseApiDto })
  );
}

export function ListInsightsSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'List Insights for a DataMart' }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiExtraModels(InsightListItemResponseApiDto),
    ApiOkResponse({
      schema: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: { $ref: getSchemaPath(InsightListItemResponseApiDto) },
          },
        },
      },
    })
  );
}

export function UpdateInsightSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Update Insight' }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'insightId', description: 'Insight ID' }),
    ApiBody({ type: UpdateInsightRequestApiDto }),
    ApiOkResponse({ type: InsightResponseApiDto })
  );
}

export function DeleteInsightSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Soft delete Insight' }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'insightId', description: 'Insight ID' }),
    ApiNoContentResponse({ description: 'Insight deleted' })
  );
}

export function UpdateInsightTitleSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Update Insight title' }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'insightId', description: 'Insight ID' }),
    ApiBody({ type: UpdateInsightTitleApiDto }),
    ApiOkResponse({ type: InsightResponseApiDto })
  );
}

export function RunInsightSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Run Insight (manual)' }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'insightId', description: 'Insight ID' }),
    ApiOkResponse({ type: RunInsightResponseApiDto })
  );
}
