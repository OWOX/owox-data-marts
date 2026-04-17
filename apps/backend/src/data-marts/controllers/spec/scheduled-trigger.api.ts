import { applyDecorators } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { CreateScheduledTriggerRequestApiDto } from '../../dto/presentation/create-scheduled-trigger-request-api.dto';
import { ScheduledTriggerResponseApiDto } from '../../dto/presentation/scheduled-trigger-response-api.dto';
import { UpdateScheduledTriggerRequestApiDto } from '../../dto/presentation/update-scheduled-trigger-request-api.dto';
import { ScheduledTriggerType } from '../../scheduled-trigger-types/enums/scheduled-trigger-type.enum';
import { ScheduledReportRunConfigType } from '../../scheduled-trigger-types/scheduled-report-run/schemas/scheduled-report-run-config.schema';

export function CreateScheduledTriggerSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Create a scheduled trigger for a DataMart',
      description:
        'Creates a scheduled connector run or report run trigger for a published DataMart. REPORT_RUN triggers require triggerConfig.reportId and report mutation access. CONNECTOR_RUN triggers must not include triggerConfig and require a Technical User role.',
    }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiBody({
      type: CreateScheduledTriggerRequestApiDto,
      description:
        'Set isActive to true to schedule the next run immediately. If omitted, isActive defaults to false.',
      examples: {
        reportRun: {
          summary: 'Schedule a report run',
          value: {
            type: ScheduledTriggerType.REPORT_RUN,
            cronExpression: '0 9 * * *',
            timeZone: 'UTC',
            isActive: true,
            triggerConfig: {
              type: ScheduledReportRunConfigType,
              reportId: '9cabc24e-1234-4a5a-8b12-abcdef123456',
            },
          },
        },
        connectorRun: {
          summary: 'Schedule a connector run',
          value: {
            type: ScheduledTriggerType.CONNECTOR_RUN,
            cronExpression: '0 * * * *',
            timeZone: 'UTC',
            isActive: false,
          },
        },
      },
    }),
    ApiCreatedResponse({
      description: 'Scheduled trigger created',
      type: ScheduledTriggerResponseApiDto,
    }),
    ApiResponse({
      status: 400,
      description:
        'Invalid request, invalid cron expression, invalid trigger config, or DataMart is not published',
    }),
    ApiResponse({
      status: 403,
      description:
        'Insufficient permissions to manage the requested trigger type or report trigger target',
    }),
    ApiResponse({ status: 404, description: 'DataMart or report not found' })
  );
}

export function ListScheduledTriggersSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'List scheduled triggers for a DataMart',
      description:
        'Returns scheduled triggers for the DataMart in the current project, including createdByUser projections when available.',
    }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiOkResponse({ type: ScheduledTriggerResponseApiDto, isArray: true })
  );
}

export function GetScheduledTriggerSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get a scheduled trigger by ID',
      description:
        'Returns a scheduled trigger that belongs to the specified DataMart and project.',
    }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'id', description: 'Scheduled Trigger ID' }),
    ApiOkResponse({ type: ScheduledTriggerResponseApiDto }),
    ApiResponse({ status: 404, description: 'Scheduled trigger not found' })
  );
}

export function UpdateScheduledTriggerSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Update a scheduled trigger',
      description:
        'Updates cronExpression, timeZone, and isActive. Trigger type and triggerConfig are immutable. Permission checks are based on the existing trigger type.',
    }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'id', description: 'Scheduled Trigger ID' }),
    ApiBody({ type: UpdateScheduledTriggerRequestApiDto }),
    ApiOkResponse({
      description: 'Scheduled trigger updated',
      type: ScheduledTriggerResponseApiDto,
    }),
    ApiResponse({
      status: 400,
      description:
        'Invalid request, invalid cron expression, invalid stored trigger config, or DataMart is not published',
    }),
    ApiResponse({
      status: 403,
      description:
        'Insufficient permissions to manage the requested trigger type or report trigger target',
    }),
    ApiResponse({ status: 404, description: 'Scheduled trigger not found' })
  );
}

export function DeleteScheduledTriggerSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Delete a scheduled trigger',
      description:
        'Deletes a scheduled trigger after applying permission checks based on the existing trigger type.',
    }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'id', description: 'Scheduled Trigger ID' }),
    ApiOkResponse({ description: 'Scheduled trigger deleted' }),
    ApiResponse({ status: 400, description: 'Invalid stored trigger config' }),
    ApiResponse({
      status: 403,
      description:
        'Insufficient permissions to manage the requested trigger type or report trigger target',
    }),
    ApiResponse({ status: 404, description: 'Scheduled trigger not found' })
  );
}
