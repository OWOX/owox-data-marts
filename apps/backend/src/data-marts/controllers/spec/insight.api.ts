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
import { InsightResponseApiDto } from '../../dto/presentation/insight-response-api.dto';
import { UpdateInsightRequestApiDto } from '../../dto/presentation/update-insight-request-api.dto';

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
    ApiExtraModels(InsightResponseApiDto),
    ApiOkResponse({
      schema: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: { $ref: getSchemaPath(InsightResponseApiDto) },
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
