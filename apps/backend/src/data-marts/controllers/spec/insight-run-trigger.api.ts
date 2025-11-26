import { applyDecorators } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  getSchemaPath,
} from '@nestjs/swagger';
import { InsightRunTriggerListItemResponseApiDto } from '../../dto/presentation/insight-run-trigger-list-item-response-api.dto';

export function CreateInsightRunTriggerSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Create a new Insight run trigger',
      description:
        'Initiates an asynchronous run of the specified Insight. Returns a trigger ID to check status and retrieve the runId.',
    }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'insightId', description: 'Insight ID' }),
    ApiCreatedResponse({
      description: 'Trigger created successfully',
      schema: {
        type: 'object',
        properties: {
          triggerId: {
            type: 'string',
            description: 'ID of the created trigger',
            example: '550e8400-e29b-41d4-a716-446655440000',
          },
        },
      },
    })
  );
}

export function ListInsightRunTriggersSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'List Insight run triggers',
      description: 'Returns a list of triggers for the specified Insight.',
    }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'insightId', description: 'Insight ID' }),
    ApiExtraModels(InsightRunTriggerListItemResponseApiDto),
    ApiOkResponse({
      schema: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: { $ref: getSchemaPath(InsightRunTriggerListItemResponseApiDto) },
          },
        },
      },
    })
  );
}
