import { Injectable } from '@nestjs/common';
import type { ProjectSettingsFacade } from './project-settings.facade';
import { ProjectSettingsService } from '../services/project-settings.service';

@Injectable()
export class ProjectSettingsFacadeImpl implements ProjectSettingsFacade {
  constructor(private readonly projectSettingsService: ProjectSettingsService) {}

  async getDescription(projectId: string): Promise<string | null> {
    const settings = await this.projectSettingsService.findByProjectId(projectId);
    return settings?.description ?? null;
  }
}
