import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiParam } from '@nestjs/swagger';
import { NotificationSettingsResponseApiDto } from '../../dto/presentation/notification-settings-response-api.dto';
import { NotificationSettingsItemResponseApiDto } from '../../dto/presentation/notification-settings-item-response-api.dto';
import { ProjectMembersResponseApiDto } from '../../dto/presentation/project-members-response-api.dto';
import { UpdateNotificationSettingApiDto } from '../../dto/presentation/update-notification-setting-request-api.dto';

export function GetNotificationSettingsSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get notification settings for a project' }),
    ApiOkResponse({ type: NotificationSettingsResponseApiDto })
  );
}

export function GetProjectMembersSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get project members for receiver selection' }),
    ApiOkResponse({ type: ProjectMembersResponseApiDto })
  );
}

export function UpdateNotificationSettingSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Update a specific notification setting' }),
    ApiParam({ name: 'notificationType', description: 'Notification type' }),
    ApiBody({ type: UpdateNotificationSettingApiDto }),
    ApiOkResponse({ type: NotificationSettingsItemResponseApiDto })
  );
}

export function TestWebhookSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Send a test webhook for a notification type' }),
    ApiParam({ name: 'notificationType', description: 'Notification type' }),
    ApiBody({ schema: { properties: { webhookUrl: { type: 'string' } } } }),
    ApiOkResponse({ schema: { properties: { message: { type: 'string' } } } })
  );
}
