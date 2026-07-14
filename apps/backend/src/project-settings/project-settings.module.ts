import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdpModule } from '../idp/idp.module';
import { ProjectSettingsController } from './controllers/project-settings.controller';
import { ProjectSettings } from './entities/project-settings.entity';
import { PROJECT_SETTINGS_FACADE } from './facades/project-settings.facade';
import { ProjectSettingsFacadeImpl } from './facades/project-settings.facade.impl';
import { ProjectSettingsMapper } from './mappers/project-settings.mapper';
import { ProjectSettingsService } from './services/project-settings.service';
import { GetProjectSettingsService } from './use-cases/get-project-settings.service';
import { UpdateProjectDescriptionService } from './use-cases/update-project-description.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProjectSettings]), IdpModule],
  controllers: [ProjectSettingsController],
  providers: [
    ProjectSettingsService,
    ProjectSettingsMapper,
    GetProjectSettingsService,
    UpdateProjectDescriptionService,
    ProjectSettingsFacadeImpl,
    {
      provide: PROJECT_SETTINGS_FACADE,
      useExisting: ProjectSettingsFacadeImpl,
    },
  ],
  exports: [PROJECT_SETTINGS_FACADE],
})
export class ProjectSettingsModule {}
