import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Role } from '@owox/idp-protocol';
import { satisfiesRole } from '../../idp/utils/role-hierarchy';
import type { ProjectSettingsContext, ProjectSettingsFacade } from './project-settings.facade';
import { GetProjectSettingsCommand } from '../dto/domain/get-project-settings.command';
import { UpdateProjectDescriptionCommand } from '../dto/domain/update-project-description.command';
import type { ProjectSettingsDto } from '../dto/domain/project-settings.dto';
import { ProjectSettingsService } from '../services/project-settings.service';
import { GetProjectSettingsService } from '../use-cases/get-project-settings.service';
import { UpdateProjectDescriptionService } from '../use-cases/update-project-description.service';

@Injectable()
export class ProjectSettingsFacadeImpl implements ProjectSettingsFacade {
  constructor(
    private readonly projectSettingsService: ProjectSettingsService,
    private readonly getProjectSettingsService: GetProjectSettingsService,
    private readonly updateProjectDescriptionService: UpdateProjectDescriptionService
  ) {}

  async getDescription(projectId: string): Promise<string | null> {
    const settings = await this.projectSettingsService.findByProjectId(projectId);
    return settings?.description ?? null;
  }

  async getSettings(ctx: ProjectSettingsContext): Promise<ProjectSettingsDto> {
    this.requireRole(ctx, 'viewer');
    return this.getProjectSettingsService.run(new GetProjectSettingsCommand(ctx.projectId));
  }

  async updateDescription(
    ctx: ProjectSettingsContext,
    input: { description: string | null }
  ): Promise<ProjectSettingsDto> {
    this.requireRole(ctx, 'admin');
    return this.updateProjectDescriptionService.run(
      new UpdateProjectDescriptionCommand(ctx.projectId, input.description)
    );
  }

  private requireRole(ctx: ProjectSettingsContext, role: Role): void {
    if (!ctx.userId?.trim() || !ctx.projectId?.trim() || !satisfiesRole(ctx.roles, role)) {
      throw new ForbiddenException(`An authenticated project ${role} is required`);
    }
  }
}
