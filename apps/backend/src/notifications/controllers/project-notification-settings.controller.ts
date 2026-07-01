import { Body, Controller, Get, Param, ParseEnumPipe, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthContext, AuthorizationContext, Auth } from '../../idp';
import { Role, Strategy } from '../../idp/types/role-config.types';
import { GetNotificationSettingsService } from '../use-cases/get-notification-settings.service';
import { GetProjectMembersService } from '../use-cases/get-project-members.service';
import { UpsertNotificationSettingService } from '../use-cases/upsert-notification-setting.service';
import { TestNotificationWebhookService } from '../use-cases/test-notification-webhook.service';
import { GetNotificationSettingsCommand } from '../dto/domain/get-notification-settings.command';
import { UpsertNotificationSettingCommand } from '../dto/domain/upsert-notification-setting.command';
import { TestNotificationWebhookCommand } from '../dto/domain/test-notification-webhook.command';
import { NotificationSettingsResponseApiDto } from '../dto/presentation/notification-settings-response-api.dto';
import { NotificationSettingsItemResponseApiDto } from '../dto/presentation/notification-settings-item-response-api.dto';
import { ProjectMembersResponseApiDto } from '../dto/presentation/project-members-response-api.dto';
import { UpdateNotificationSettingApiDto } from '../dto/presentation/update-notification-setting-request-api.dto';
import { NotificationType } from '../enums/notification-type.enum';
import {
  GetNotificationSettingsSpec,
  GetProjectMembersSpec,
  UpdateNotificationSettingSpec,
  TestWebhookSpec,
} from './spec/notification-settings.api';

@Controller('projects/notification-settings')
@ApiTags('ProjectNotificationSettings')
export class ProjectNotificationSettingsController {
  constructor(
    private readonly getNotificationSettingsService: GetNotificationSettingsService,
    private readonly getProjectMembersService: GetProjectMembersService,
    private readonly upsertNotificationSettingService: UpsertNotificationSettingService,
    private readonly testNotificationWebhookService: TestNotificationWebhookService
  ) {}

  @Auth(Role.viewer(Strategy.PARSE))
  @Get()
  @GetNotificationSettingsSpec()
  async getSettings(
    @AuthContext() context: AuthorizationContext
  ): Promise<NotificationSettingsResponseApiDto> {
    return this.getNotificationSettingsService.run(
      new GetNotificationSettingsCommand(context.projectId)
    );
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get('members')
  @GetProjectMembersSpec()
  async getProjectMembers(
    @AuthContext() context: AuthorizationContext
  ): Promise<ProjectMembersResponseApiDto> {
    const members = await this.getProjectMembersService.run(context.projectId);
    return { members };
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Put(':notificationType')
  @UpdateNotificationSettingSpec()
  async updateSetting(
    @AuthContext() context: AuthorizationContext,
    @Param('notificationType', new ParseEnumPipe(NotificationType))
    notificationType: NotificationType,
    @Body() dto: UpdateNotificationSettingApiDto
  ): Promise<NotificationSettingsItemResponseApiDto> {
    return this.upsertNotificationSettingService.run(
      new UpsertNotificationSettingCommand(
        context.projectId,
        notificationType,
        dto.enabled,
        dto.receivers,
        dto.webhookUrl,
        dto.groupingDelayCron
      )
    );
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Post(':notificationType/test-webhook')
  @TestWebhookSpec()
  async testWebhook(
    @AuthContext() context: AuthorizationContext,
    @Param('notificationType', new ParseEnumPipe(NotificationType))
    notificationType: NotificationType,
    @Body() body: { webhookUrl?: string }
  ): Promise<{ message: string }> {
    await this.testNotificationWebhookService.run(
      new TestNotificationWebhookCommand(
        context.projectId,
        notificationType,
        body.webhookUrl,
        context.userId,
        context.projectTitle
      )
    );
    return { message: 'Test webhook sent successfully' };
  }
}
