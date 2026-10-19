import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import type {
  McpProjectSetupDto,
  McpProjectSetupRequest,
  McpUpdateProjectDescriptionRequest,
  McpProjectDescriptionDto,
} from '../dto/domain/mcp-project-setup.dto';
import { McpProjectSetupMapper } from '../mappers/mcp-project-setup.mapper';
import { ProjectSettingsService } from '../services/project-settings.service';
import { projectDescriptionUpdateSchema } from '../dto/domain/project-description-update.schema';
import { UpdateProjectDescriptionCommand } from '../dto/domain/update-project-description.command';
import { UpdateProjectDescriptionService } from '../use-cases/update-project-description.service';
import type { McpProjectSetupFacade } from './mcp-project-setup.facade';

@Injectable()
export class McpProjectSetupFacadeImpl implements McpProjectSetupFacade {
  constructor(
    private readonly idp: IdpProjectionsFacade,
    private readonly settings: ProjectSettingsService,
    private readonly mapper: McpProjectSetupMapper,
    private readonly updateDescription: UpdateProjectDescriptionService
  ) {}

  async getProjectSetup(request: McpProjectSetupRequest): Promise<McpProjectSetupDto> {
    const project = await this.getAuthorizedProject(request);
    return this.mapper.toSetupDto(project, await this.settings.findByProjectId(request.projectId));
  }

  async updateProjectDescription(
    request: McpUpdateProjectDescriptionRequest
  ): Promise<McpProjectDescriptionDto> {
    const project = await this.getAuthorizedProject(request);
    if (!project.roles?.includes('admin')) {
      throw new ForbiddenException('Only a project admin can update the description');
    }
    const input = projectDescriptionUpdateSchema.parse({
      description: request.description,
      expectedRevision: request.expectedRevision,
    });
    const saved = await this.updateDescription.run(
      new UpdateProjectDescriptionCommand(
        request.projectId,
        input.description,
        input.expectedRevision
      )
    );
    return { description: saved.description, revision: saved.revision };
  }

  private async getAuthorizedProject(request: McpProjectSetupRequest) {
    if (!request.projectId?.trim() || !request.userId?.trim()) {
      throw new UnauthorizedException('Project setup requires a project and user');
    }
    const project = await this.idp.getProjectForUser(request.userId, request.projectId);
    if (
      project.id !== request.projectId ||
      (project.status !== undefined && project.status !== 'active') ||
      !project.roles?.some(role => role === 'admin' || role === 'editor')
    ) {
      throw new ForbiddenException('Project setup requires current project editor or admin access');
    }
    return project;
  }
}
