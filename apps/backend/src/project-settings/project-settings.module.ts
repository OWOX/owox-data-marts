import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdpModule } from '../idp/idp.module';
import { ProjectSettingsController } from './controllers/project-settings.controller';
import { ProjectSettings } from './entities/project-settings.entity';
import { PROJECT_SETTINGS_FACADE } from './facades/project-settings.facade';
import { ProjectSettingsFacadeImpl } from './facades/project-settings.facade.impl';
import { MCP_PROJECT_SETUP_FACADE } from './facades/mcp-project-setup.facade';
import { McpProjectSetupFacadeImpl } from './facades/mcp-project-setup.facade.impl';
import { McpProjectSetupMapper } from './mappers/mcp-project-setup.mapper';
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
    McpProjectSetupMapper,
    GetProjectSettingsService,
    UpdateProjectDescriptionService,
    ProjectSettingsFacadeImpl,
    {
      provide: PROJECT_SETTINGS_FACADE,
      useExisting: ProjectSettingsFacadeImpl,
    },
    { provide: MCP_PROJECT_SETUP_FACADE, useClass: McpProjectSetupFacadeImpl },
  ],
  exports: [PROJECT_SETTINGS_FACADE, MCP_PROJECT_SETUP_FACADE],
})
export class ProjectSettingsModule {}
