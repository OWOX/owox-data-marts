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
import { CreateAiHelperTriggerRequestApiDto } from '../../dto/presentation/create-ai-helper-trigger-request-api.dto';
import { AiHelperTriggerResponseApiDto } from '../../dto/presentation/ai-helper-trigger-response-api.dto';

/**
 * API spec for creating a new AI helper trigger
 */
export function CreateAiHelperTriggerSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Create a new AI helper trigger',
      description:
        'Creates an asynchronous AI metadata generation trigger for the specified DataMart. ' +
        'Poll the trigger status, then retrieve the result when processing is finished.',
    }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiBody({ type: CreateAiHelperTriggerRequestApiDto }),
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
    }),
    ApiResponse({ status: 403, description: 'Current user is not allowed to edit this DataMart' }),
    ApiResponse({ status: 503, description: 'AI helper is not configured on this deployment' })
  );
}

/**
 * API spec for getting AI helper trigger status
 */
export function GetAiHelperTriggerStatusSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get AI helper trigger status',
      description: 'Returns the current scheduler status for the AI helper trigger.',
    }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'triggerId', description: 'AI helper trigger ID' }),
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
 * API spec for getting AI helper trigger result
 */
export function GetAiHelperTriggerResponseSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get AI helper result',
      description:
        'Returns and removes the AI helper result when the trigger succeeds. ' +
        'Trigger errors are returned with HTTP 400 carrying the user-facing error message.',
    }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'triggerId', description: 'AI helper trigger ID' }),
    ApiOkResponse({
      description: 'AI helper result',
      type: AiHelperTriggerResponseApiDto,
    }),
    ApiResponse({ status: 400, description: 'Trigger failed or was cancelled' }),
    ApiResponse({ status: 404, description: 'Trigger not found' }),
    ApiResponse({ status: 408, description: 'Trigger response is not ready' })
  );
}

/**
 * API spec for cancelling AI helper trigger processing
 */
export function CancelAiHelperTriggerSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Cancel AI helper trigger',
      description:
        'Cancels an AI helper trigger owned by the current user. Idle or successful triggers are removed; ready or processing triggers are marked as cancelling.',
    }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'triggerId', description: 'AI helper trigger ID' }),
    ApiOkResponse({
      description: 'Trigger cancellation accepted or trigger removed',
    }),
    ApiResponse({ status: 400, description: "Trigger can't be cancelled at current state" }),
    ApiResponse({ status: 403, description: 'Current user is not allowed to cancel this trigger' }),
    ApiResponse({ status: 404, description: 'Trigger not found' })
  );
}
