import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DataMartsModule } from './data-marts/data-marts.module';
import { CommonModule } from './common/common.module';
import { OwoxEventDispatcherModule } from './common/event-dispatcher/owox-event-dispatcher.module';
import { ActiveRequestInterceptor } from './common/interceptors/active-request.interceptor';
import { IdpModule } from './idp/idp.module';
import { EeModule } from './ee/ee.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProjectMemberApiKeysModule } from './project-member-api-keys/project-member-api-keys.module';
import { SearchModule } from './data-marts/search/search.module';
import { ProjectSettingsModule } from './project-settings/project-settings.module';
import { createDataSourceOptions } from './config/data-source-options.config';
import { validateConfig } from './config/env-validation.config';
import { ClsModule } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { addTransactionalDataSource } from 'typeorm-transactional';
import { serializeSqliteTransactions } from './config/sqlite-transaction-serializer';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateConfig,
    }),

    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        return createDataSourceOptions(config);
      },
      async dataSourceFactory(options) {
        if (!options) {
          throw new Error('Invalid options passed');
        }
        const dataSource = new DataSource(options);
        await dataSource.initialize();
        return serializeSqliteTransactions(addTransactionalDataSource(dataSource));
      },
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    OwoxEventDispatcherModule,

    DataMartsModule,
    SearchModule,
    CommonModule,
    IdpModule,
    EeModule,
    ProjectMemberApiKeysModule,
    NotificationsModule,
    ProjectSettingsModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: ActiveRequestInterceptor,
    },
  ],
})
export class AppModule {}
