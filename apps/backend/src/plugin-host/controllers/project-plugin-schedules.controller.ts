import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseFilters,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { normalizeProjectListPagination } from '../../data-marts/utils/normalize-project-list-pagination';
import { Auth, AuthContext, RejectPluginAuth, type AuthorizationContext } from '../../idp';
import { Role, Strategy } from '../../idp/types/role-config.types';
import {
  ListProjectPluginSchedulesCommand,
  ProjectPluginScheduleCommand,
} from '../dto/domain/project-plugin-schedule.command';
import {
  ProjectPluginScheduleApiDto,
  ProjectPluginScheduleListApiDto,
} from '../dto/presentation/project-plugin-schedule-api.dto';
import { PluginHostExceptionFilter } from '../filters/plugin-host-exception.filter';
import { toProjectPluginScheduleResponse } from '../mappers/plugin-action-schedule.mapper';
import { ProjectPluginSchedulesService } from '../use-cases/project-plugin-schedules.service';

// Names other members' schedules, so a plugin's runtime token must not reach it.
@ApiTags('Plugins')
@Controller('plugins')
@UseFilters(PluginHostExceptionFilter)
export class ProjectPluginSchedulesController {
  constructor(private readonly schedules: ProjectPluginSchedulesService) {}

  @Auth(Role.viewer(Strategy.PARSE))
  @RejectPluginAuth()
  @Get('schedules')
  @ApiOperation({
    summary: 'Plugin schedules in this project',
    description:
      "A project admin gets the schedules of every installation in the project; anyone else gets their own installations', uninstalled ones included. installationId narrows to one installation the caller can see, and any other reads as empty. Parameters are left out.",
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Default and maximum 100.',
  })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({ name: 'installationId', required: false, type: String })
  @ApiOkResponse({ type: ProjectPluginScheduleListApiDto })
  async list(
    @AuthContext() context: AuthorizationContext,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('installationId', new ParseUUIDPipe({ optional: true })) installationId?: string
  ): Promise<ProjectPluginScheduleListApiDto> {
    const pagination = normalizeProjectListPagination(limit, offset);
    const page = await this.schedules.list(
      new ListProjectPluginSchedulesCommand(
        context,
        pagination.limit,
        pagination.offset,
        installationId ?? null
      )
    );
    return { items: page.items.map(toProjectPluginScheduleResponse), total: page.total };
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @RejectPluginAuth()
  @Post('schedules/:id/pause')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Pause a plugin schedule',
    description:
      "Cancels its queued run; a running one continues. A paused schedule stays paused. A project admin's pause of another member's schedule sets disabledReason PAUSED_BY_ADMIN, which the plugin cannot resume.",
  })
  @ApiOkResponse({ type: ProjectPluginScheduleApiDto })
  async pause(
    @AuthContext() context: AuthorizationContext,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<ProjectPluginScheduleApiDto> {
    return toProjectPluginScheduleResponse(
      await this.schedules.pause(new ProjectPluginScheduleCommand(context, id))
    );
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @RejectPluginAuth()
  @Post('schedules/:id/resume')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Resume a paused or disabled plugin schedule',
    description:
      "Checks the schedule against the plugin's current version first; a refusal leaves it as it was. Clears disabledReason, PAUSED_BY_ADMIN included. Its runs keep the installation owner's access, whoever resumed it.",
  })
  @ApiOkResponse({ type: ProjectPluginScheduleApiDto })
  async resume(
    @AuthContext() context: AuthorizationContext,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<ProjectPluginScheduleApiDto> {
    return toProjectPluginScheduleResponse(
      await this.schedules.resume(new ProjectPluginScheduleCommand(context, id))
    );
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @RejectPluginAuth()
  @Delete('schedules/:id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a plugin schedule',
    description: 'Cancels its queued run; a running one continues.',
  })
  @ApiNoContentResponse()
  async delete(
    @AuthContext() context: AuthorizationContext,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<void> {
    await this.schedules.delete(new ProjectPluginScheduleCommand(context, id));
  }
}
