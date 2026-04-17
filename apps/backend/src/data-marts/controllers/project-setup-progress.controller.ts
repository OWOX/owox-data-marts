import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthContext, AuthorizationContext, Auth } from '../../idp';
import { Role, Strategy } from '../../idp/types/role-config.types';
import { ProjectSetupProgressResponseApiDto } from '../dto/presentation/project-setup-progress-response-api.dto';
import { ProjectSetupProgressMapper } from '../mappers/project-setup-progress.mapper';
import { GetProjectSetupProgressService } from '../use-cases/get-project-setup-progress.service';

@ApiTags('project-setup-progress')
@Controller('project-setup-progress')
export class ProjectSetupProgressController {
  constructor(
    private readonly getProjectSetupProgressService: GetProjectSetupProgressService,
    private readonly mapper: ProjectSetupProgressMapper
  ) {}

  @Auth(Role.viewer(Strategy.PARSE))
  @Get()
  async getProgress(
    @AuthContext() context: AuthorizationContext
  ): Promise<ProjectSetupProgressResponseApiDto> {
    const command = this.mapper.toGetCommand(context);
    const dto = await this.getProjectSetupProgressService.run(command);
    return this.mapper.toApiResponse(dto);
  }
}
