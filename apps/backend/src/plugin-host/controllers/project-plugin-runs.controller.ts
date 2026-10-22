import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseFilters,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, RejectPluginAuth, type AuthorizationContext } from '../../idp';
import { Role, Strategy } from '../../idp/types/role-config.types';
import {
  ListPluginRunsCommand,
  PLUGIN_RUNS_DEFAULT_LIMIT,
  PluginRunCommand,
} from '../dto/domain/plugin-run.command';
import {
  ListPluginRunsQueryApiDto,
  PluginRunApiDto,
  PluginRunListApiDto,
} from '../dto/presentation/plugin-run-api.dto';
import { PluginHostExceptionFilter } from '../filters/plugin-host-exception.filter';
import { toPluginRunResponse } from '../mappers/plugin-action-execution.mapper';
import { ProjectPluginRunsService } from '../use-cases/project-plugin-runs.service';

// Names other members' runs, so a plugin's runtime token must not reach it.
@ApiTags('Plugins')
@Controller('plugins')
@UseFilters(PluginHostExceptionFilter)
export class ProjectPluginRunsController {
  constructor(private readonly runs: ProjectPluginRunsService) {}

  @Auth(Role.viewer(Strategy.PARSE))
  @RejectPluginAuth()
  @Get('runs')
  @ApiOperation({
    summary: 'Plugin action runs in this project',
    description:
      "Newest first, ties by id. A project admin gets every run in the project and may narrow by userId; anyone else gets their own installations' runs, and userId is ignored. Input and result are left out.",
  })
  @ApiOkResponse({ type: PluginRunListApiDto })
  async list(
    @AuthContext() context: AuthorizationContext,
    @Query() query: ListPluginRunsQueryApiDto
  ): Promise<PluginRunListApiDto> {
    const page = await this.runs.list(
      new ListPluginRunsCommand(
        context,
        {
          statuses: query.status ?? [],
          trigger: query.trigger ?? null,
          pluginId: query.pluginId ?? null,
          scheduleId: query.scheduleId ?? null,
          userId: query.userId ?? null,
        },
        query.cursor ?? null,
        query.limit ?? PLUGIN_RUNS_DEFAULT_LIMIT
      )
    );
    return { items: page.items.map(toPluginRunResponse), nextCursor: page.nextCursor };
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @RejectPluginAuth()
  @Get('runs/:id')
  @ApiOperation({ summary: 'One plugin action run' })
  @ApiOkResponse({ type: PluginRunApiDto })
  async get(
    @AuthContext() context: AuthorizationContext,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<PluginRunApiDto> {
    return toPluginRunResponse(await this.runs.get(new PluginRunCommand(context, id)));
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @RejectPluginAuth()
  @Post('runs/:id/cancel')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Cancel a queued or running plugin action run',
    description: 'A run that already finished keeps its outcome and is returned as it is.',
  })
  @ApiOkResponse({ type: PluginRunApiDto })
  async cancel(
    @AuthContext() context: AuthorizationContext,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<PluginRunApiDto> {
    return toPluginRunResponse(await this.runs.cancel(new PluginRunCommand(context, id)));
  }
}
