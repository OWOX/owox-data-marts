import { applyDecorators } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { TriggerStatus } from '../../../common/scheduler/shared/entities/trigger-status';
import { SqlDryRunRequestApiDto } from '../../dto/presentation/sql-dry-run-request-api.dto';
import { SqlDryRunResponseApiDto } from '../../dto/presentation/sql-dry-run-response-api.dto';

/**
 * API spec for creating a new SQL dry run trigger
 */
export function CreateSqlDryRunTriggerSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Create a new SQL dry run trigger',
      description:
        'Creates an asynchronous SQL dry run trigger for the specified DataMart. Poll the trigger status, then retrieve the SQL dry run result when processing is finished.',
    }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiBody({ type: SqlDryRunRequestApiDto }),
    ApiCreatedResponse({
      description: 'Trigger created successfully',
      schema: {
        type: 'object',
        required: ['triggerId'],
        properties: {
          triggerId: {
            type: 'string',
            format: 'uuid',
            description: 'ID of the created trigger',
            example: '550e8400-e29b-41d4-a716-446655440000',
          },
        },
      },
    })
  );
}

/**
 * API spec for getting SQL dry run trigger status
 */
export function GetSqlDryRunTriggerStatusSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get SQL dry run trigger status',
      description: 'Returns the current scheduler status for the SQL dry run trigger.',
    }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'triggerId', description: 'SQL dry run trigger ID' }),
    ApiOkResponse({
      description: 'Current trigger status',
      schema: {
        type: 'object',
        required: ['status'],
        properties: {
          status: {
            type: 'string',
            enum: Object.values(TriggerStatus),
            example: TriggerStatus.IDLE,
            description: 'Current trigger status',
          },
        },
      },
    }),
    ApiResponse({ status: 404, description: 'Trigger not found' })
  );
}

/**
 * API spec for getting SQL dry run trigger result
 */
export function GetSqlDryRunTriggerResponseSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get SQL dry run result',
      description:
        'Returns and removes the SQL dry run result when the trigger succeeds. SQL validation failures are returned as isValid=false with an error message.',
    }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'triggerId', description: 'SQL dry run trigger ID' }),
    ApiOkResponse({
      description: 'SQL dry run result',
      type: SqlDryRunResponseApiDto,
    }),
    ApiResponse({ status: 400, description: 'Trigger failed or was cancelled' }),
    ApiResponse({ status: 404, description: 'Trigger not found' }),
    ApiResponse({ status: 408, description: 'Trigger response is not ready' })
  );
}

/**
 * API spec for cancelling SQL dry run trigger processing
 */
export function CancelSqlDryRunTriggerSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Cancel SQL dry run trigger',
      description:
        'Cancels a SQL dry run trigger owned by the current user. Idle or successful triggers are removed; ready or processing triggers are marked as cancelling.',
    }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'triggerId', description: 'SQL dry run trigger ID' }),
    ApiOkResponse({
      description: 'Trigger cancellation accepted or trigger removed',
    }),
    ApiResponse({ status: 400, description: "Trigger can't be cancelled at current state" }),
    ApiResponse({ status: 403, description: 'Current user is not allowed to cancel this trigger' }),
    ApiResponse({ status: 404, description: 'Trigger not found' })
  );
}
