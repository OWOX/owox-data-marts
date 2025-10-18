import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiBody, ApiParam, ApiCreatedResponse } from '@nestjs/swagger';
import { SqlDryRunRequestApiDto } from '../../dto/presentation/sql-dry-run-request-api.dto';

/**
 * API spec for creating a new SQL dry run trigger
 */
export function CreateSqlDryRunTriggerSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Create a new SQL dry run trigger',
      description:
        'Initiates an asynchronous SQL validation process. Returns a trigger ID that can be used to check the validation status and retrieve results.',
    }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiBody({ type: SqlDryRunRequestApiDto }),
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
