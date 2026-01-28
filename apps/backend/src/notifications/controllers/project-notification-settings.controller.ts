import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
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

@Controller('projects/:projectId/notification-settings')
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
    @AuthContext() _context: AuthorizationContext,
    @Param('projectId') projectId: string
  ): Promise<NotificationSettingsResponseApiDto> {
    return this.getNotificationSettingsService.run(new GetNotificationSettingsCommand(projectId));
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get('members')
  @GetProjectMembersSpec()
  async getProjectMembers(
    @AuthContext() _context: AuthorizationContext,
    @Param('projectId') projectId: string
  ): Promise<ProjectMembersResponseApiDto> {
    const members = await this.getProjectMembersService.run(projectId);
    return { members };
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Put(':notificationType')
  @UpdateNotificationSettingSpec()
  async updateSetting(
    @AuthContext() _context: AuthorizationContext,
    @Param('projectId') projectId: string,
    @Param('notificationType') notificationType: NotificationType,
    @Body() dto: UpdateNotificationSettingApiDto
  ): Promise<NotificationSettingsItemResponseApiDto> {
    return this.upsertNotificationSettingService.run(
      new UpsertNotificationSettingCommand(
        projectId,
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
    @AuthContext() _context: AuthorizationContext,
    @Param('projectId') projectId: string,
    @Param('notificationType') notificationType: NotificationType,
    @Body() body: { webhookUrl?: string }
  ): Promise<{ message: string }> {
    await this.testNotificationWebhookService.run(
      new TestNotificationWebhookCommand(
        projectId,
        notificationType,
        body.webhookUrl,
        _context.userId,
        _context.projectTitle
      )
    );
    return { message: 'Test webhook sent successfully' };
  }
}
