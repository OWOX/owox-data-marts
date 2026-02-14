import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectNotificationSettings } from './entities/project-notification-settings.entity';
import { NotificationPendingQueue } from './entities/notification-pending-queue.entity';
import { ProjectNotificationSettingsService } from './services/project-notification-settings.service';
import { NotificationQueueService } from './services/notification-queue.service';
import { GetNotificationSettingsService } from './use-cases/get-notification-settings.service';
import { GetProjectMembersService } from './use-cases/get-project-members.service';
import { UpsertNotificationSettingService } from './use-cases/upsert-notification-setting.service';
import { TestNotificationWebhookService } from './use-cases/test-notification-webhook.service';
import { NotificationEmailService } from './services/notification-email.service';
import { NotificationWebhookService } from './services/notification-webhook.service';
import { NotificationService } from './services/notification.service';
import { NotificationSettingsMapper } from './mappers/notification-settings.mapper';
import { ProjectNotificationSettingsController } from './controllers/project-notification-settings.controller';
import { RunsNotificationProcessor } from './system-triggers/runs-notification.processor';
import { SendNotificationProcessor } from './system-triggers/send-notification.processor';
import { EmailModule } from '../common/email/email.module';
import { IdpModule } from '../idp/idp.module';
import { DataMartsModule } from '../data-marts/data-marts.module';
import { DataMartRun } from '../data-marts/entities/data-mart-run.entity';
import { ConfigService } from '@nestjs/config';
import { createMailingProvider, type EmailProviderName } from '@owox/internal-helpers';
import { NOTIFICATIONS_EMAIL_PROVIDER_FACADE } from './types/email-provider.facade';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectNotificationSettings, NotificationPendingQueue, DataMartRun]),
    EmailModule,
    IdpModule,
    forwardRef(() => DataMartsModule),
  ],
  controllers: [ProjectNotificationSettingsController],
  providers: [
    ProjectNotificationSettingsService,
    NotificationSettingsMapper,
    GetNotificationSettingsService,
    GetProjectMembersService,
    UpsertNotificationSettingService,
    TestNotificationWebhookService,
    NotificationQueueService,
    NotificationEmailService,
    NotificationWebhookService,
    NotificationService,
    RunsNotificationProcessor,
    SendNotificationProcessor,
    {
      provide: NOTIFICATIONS_EMAIL_PROVIDER_FACADE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const name = (
          config.get<string>('EMAIL_PROVIDER') ?? 'none'
        ).toLowerCase() as EmailProviderName;

        return createMailingProvider({
          provider: name,
          sendgrid: {
            apiKey: config.get<string>('SENDGRID_API_KEY') as string,
            verifiedSenderEmail: config.get<string>(
              'NOTIFICATIONS_VERIFIED_SENDER_EMAIL'
            ) as string,
            verifiedSenderName:
              config.get<string>('NOTIFICATIONS_VERIFIED_SENDER_NAME') ?? undefined,
          },
        });
      },
    },
  ],
  exports: [
    ProjectNotificationSettingsService,
    GetNotificationSettingsService,
    UpsertNotificationSettingService,
    TestNotificationWebhookService,
    NotificationQueueService,
    NotificationEmailService,
    NotificationWebhookService,
    NotificationService,
    RunsNotificationProcessor,
    SendNotificationProcessor,
  ],
})
export class NotificationsModule {}
