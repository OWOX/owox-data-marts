import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DataMartsModule } from './data-marts/data-marts.module';
import { CommonModule } from './common/common.module';
import { createDataSourceOptions } from './config/data-source-options.config';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createDataSourceOptions(config),
    }),
    ScheduleModule.forRoot(),

    DataMartsModule,
    CommonModule,
    AuthModule,
  ],
})
export class AppModule {}
