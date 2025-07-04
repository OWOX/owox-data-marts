import { applyDecorators } from '@nestjs/common';
import {
  ApiBody,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { CreateScheduledTriggerRequestApiDto } from '../../dto/presentation/create-scheduled-trigger-request-api.dto';
import { ScheduledTriggerResponseApiDto } from '../../dto/presentation/scheduled-trigger-response-api.dto';
import { UpdateScheduledTriggerRequestApiDto } from '../../dto/presentation/update-scheduled-trigger-request-api.dto';

export function CreateScheduledTriggerSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Create a new scheduled trigger for a DataMart' }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiBody({ type: CreateScheduledTriggerRequestApiDto }),
    ApiResponse({ status: 201, type: ScheduledTriggerResponseApiDto })
  );
}

export function ListScheduledTriggersSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'List all scheduled triggers for a DataMart' }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiResponse({ status: 200, type: ScheduledTriggerResponseApiDto, isArray: true })
  );
}

export function GetScheduledTriggerSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get a scheduled trigger by ID' }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'id', description: 'Scheduled Trigger ID' }),
    ApiResponse({ status: 200, type: ScheduledTriggerResponseApiDto })
  );
}

export function UpdateScheduledTriggerSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Update a scheduled trigger' }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'id', description: 'Scheduled Trigger ID' }),
    ApiBody({ type: UpdateScheduledTriggerRequestApiDto }),
    ApiOkResponse({ type: ScheduledTriggerResponseApiDto })
  );
}

export function DeleteScheduledTriggerSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Delete a scheduled trigger' }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'id', description: 'Scheduled Trigger ID' }),
    ApiNoContentResponse({ description: 'Scheduled trigger deleted' })
  );
}
