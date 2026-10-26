import { Injectable } from '@nestjs/common';
import type { ProjectSettingsFacade } from './project-settings.facade';
import { GetProjectSettingsCommand } from '../dto/domain/get-project-settings.command';
import { UpdateProjectDescriptionCommand } from '../dto/domain/update-project-description.command';
import type { ProjectSettingsDto } from '../dto/domain/project-settings.dto';
import { GetProjectSettingsService } from '../use-cases/get-project-settings.service';
import { UpdateProjectDescriptionService } from '../use-cases/update-project-description.service';

@Injectable()
export class ProjectSettingsFacadeImpl implements ProjectSettingsFacade {
  constructor(
    private readonly getProjectSettingsService: GetProjectSettingsService,
    private readonly updateProjectDescriptionService: UpdateProjectDescriptionService
  ) {}

  async getDescription(projectId: string): Promise<string | null> {
    return (await this.getSettings(projectId)).description;
  }

  getSettings(projectId: string): Promise<ProjectSettingsDto> {
    return this.getProjectSettingsService.run(new GetProjectSettingsCommand(projectId));
  }

  updateDescription(
    projectId: string,
    input: { description: string | null }
  ): Promise<ProjectSettingsDto> {
    return this.updateProjectDescriptionService.run(
      new UpdateProjectDescriptionCommand(projectId, input.description)
    );
  }
}
