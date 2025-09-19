import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DataMartsModule } from './data-marts/data-marts.module';
import { CommonModule } from './common/common.module';
import { IdpModule } from './idp/idp.module';
import { createDataSourceOptions } from './config/data-source-options.config';
import { validateConfig } from './config/env-validation.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateConfig,
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createDataSourceOptions(config),
    }),
    ScheduleModule.forRoot(),

    DataMartsModule,
    CommonModule,
    IdpModule,
  ],
})
export class AppModule {}
