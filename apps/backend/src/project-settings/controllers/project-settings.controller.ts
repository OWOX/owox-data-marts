import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, type AuthorizationContext } from '../../idp';
import { Role, Strategy } from '../../idp/types/role-config.types';
import { ProjectSettingsMapper } from '../mappers/project-settings.mapper';
import { ProjectSettingsResponseApiDto } from '../dto/presentation/project-settings-response-api.dto';
import { UpdateProjectDescriptionApiDto } from '../dto/presentation/update-project-description-api.dto';
import { GetProjectSettingsService } from '../use-cases/get-project-settings.service';
import { UpdateProjectDescriptionService } from '../use-cases/update-project-description.service';

@ApiTags('ProjectSettings')
@Controller('projects/settings')
export class ProjectSettingsController {
  constructor(
    private readonly getProjectSettingsService: GetProjectSettingsService,
    private readonly updateProjectDescriptionService: UpdateProjectDescriptionService,
    private readonly mapper: ProjectSettingsMapper
  ) {}

  @Auth(Role.viewer(Strategy.PARSE))
  @Get()
  @ApiOperation({ summary: 'Get project settings' })
  @ApiOkResponse({
    description: 'The current project settings.',
    type: ProjectSettingsResponseApiDto,
  })
  async getSettings(
    @AuthContext() context: AuthorizationContext
  ): Promise<ProjectSettingsResponseApiDto> {
    const settings = await this.getProjectSettingsService.run(this.mapper.toGetCommand(context));
    return this.mapper.toResponse(settings);
  }

  @Auth(Role.admin(Strategy.INTROSPECT))
  @Put('description')
  @ApiOperation({ summary: 'Update the project description' })
  @ApiOkResponse({
    description: 'The updated project settings.',
    type: ProjectSettingsResponseApiDto,
  })
  async updateDescription(
    @AuthContext() context: AuthorizationContext,
    @Body() dto: UpdateProjectDescriptionApiDto
  ): Promise<ProjectSettingsResponseApiDto> {
    const command = this.mapper.toUpdateDescriptionCommand(context, dto);
    const settings = await this.updateProjectDescriptionService.run(command);
    return this.mapper.toResponse(settings);
  }
}
