import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppEditionConfig } from './config/app-edition-config.service';
import { PublicOriginService } from './config/public-origin.service';
import { EmailModule } from './email/email.module';
import { MarkdownParser } from './markdown/markdown-parser.service';
import { SchedulerModule } from './scheduler/scheduler.module';
import { ProducerModule } from './producer/producer.module.js';
import { AppEditionLicenseRefresherService } from './config/app-edition-license-refresher.service';
import { AiInsightsConfigService } from './ai-insights/services/ai-insights-config.service';

@Module({
  imports: [SchedulerModule, ProducerModule, EmailModule],
  providers: [
    PublicOriginService,
    {
      // This provider is used to ensure the AppEditionConfig is initialized before any other service that depends on it.
      provide: AppEditionConfig,
      useFactory: async (config: ConfigService): Promise<AppEditionConfig> => {
        const service = new AppEditionConfig(config);
        await service.actualizeAppEdition(true);
        return service;
      },
      inject: [ConfigService],
    },
    AppEditionLicenseRefresherService,
    MarkdownParser,
    AiInsightsConfigService,
  ],
  exports: [
    SchedulerModule,
    ProducerModule,
    EmailModule,
    PublicOriginService,
    AppEditionConfig,
    AiInsightsConfigService,
    MarkdownParser,
  ],
})
export class CommonModule {}
