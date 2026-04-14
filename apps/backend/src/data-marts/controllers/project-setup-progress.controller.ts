import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthContext, AuthorizationContext, Auth } from '../../idp';
import { Role, Strategy } from '../../idp/types/role-config.types';
import { ProjectSetupProgressService } from '../services/project-setup-progress.service';
import { ProjectSetupSteps } from '../dto/domain/project-setup-steps.interface';

interface ProjectSetupResponse {
  version: number;
  progress: number;
  stepsSchemaVersion: number;
  steps: ProjectSetupSteps;
}

@ApiTags('project-setup-progress')
@Controller('project-setup-progress')
export class ProjectSetupProgressController {
  constructor(private readonly progressService: ProjectSetupProgressService) {}

  @Auth(Role.viewer(Strategy.PARSE))
  @Get()
  async getProgress(@AuthContext() context: AuthorizationContext): Promise<ProjectSetupResponse> {
    const { projectProgress, mergedSteps } = await this.progressService.getFullProgress(
      context.projectId,
      context.userId
    );
    return {
      version: 1,
      stepsSchemaVersion: projectProgress.stepsSchemaVersion,
      progress: this.progressService.computeProgress(mergedSteps),
      steps: mergedSteps,
    };
  }
}
