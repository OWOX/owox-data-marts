import { applyDecorators } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  getSchemaPath,
} from '@nestjs/swagger';
import { InsightTemplateRunTriggerListItemResponseApiDto } from '../../dto/presentation/insight-template-run-trigger-list-item-response-api.dto';

export function CreateInsightTemplateRunTriggerSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Create a new Insight Template run trigger',
      description:
        'Initiates an asynchronous run of the specified Insight Template. Returns a trigger ID to check status and retrieve the runId.',
    }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'insightTemplateId', description: 'Insight Template ID' }),
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

export function ListInsightTemplateRunTriggersSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'List Insight Template run triggers',
      description: 'Returns a list of triggers for the specified Insight Template.',
    }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'insightTemplateId', description: 'Insight Template ID' }),
    ApiExtraModels(InsightTemplateRunTriggerListItemResponseApiDto),
    ApiOkResponse({
      schema: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: { $ref: getSchemaPath(InsightTemplateRunTriggerListItemResponseApiDto) },
          },
        },
      },
    })
  );
}
