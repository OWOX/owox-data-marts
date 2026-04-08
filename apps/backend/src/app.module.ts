import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DataMartsModule } from './data-marts/data-marts.module';
import { CommonModule } from './common/common.module';
import { ActiveRequestInterceptor } from './common/interceptors/active-request.interceptor';
import { IdpModule } from './idp/idp.module';
import { NotificationsModule } from './notifications/notifications.module';
import { createDataSourceOptions } from './config/data-source-options.config';
import { validateConfig } from './config/env-validation.config';
import { ClsModule } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { addTransactionalDataSource } from 'typeorm-transactional';

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
        return addTransactionalDataSource(dataSource);
      },
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),

    DataMartsModule,
    CommonModule,
    IdpModule,
    NotificationsModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: ActiveRequestInterceptor,
    },
  ],
})
export class AppModule {}
