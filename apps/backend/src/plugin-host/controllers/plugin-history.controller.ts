import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, type AuthorizationContext, RejectPluginAuth } from '../../idp';
import { Role, Strategy } from '../../idp/types/role-config.types';
import {
  ListPluginHistoryQueryApiDto,
  PluginHistoryPageApiDto,
} from '../dto/presentation/plugin-history-api.dto';
import { PluginPresentationMapper } from '../mappers/plugin-presentation.mapper';
import { ListPluginHistoryService } from '../use-cases/list-plugin-history.service';

// Names project members, so a plugin's runtime token must not read it.
@ApiTags('Plugins')
@Controller('plugins')
export class PluginHistoryController {
  constructor(
    private readonly listPluginHistoryService: ListPluginHistoryService,
    private readonly mapper: PluginPresentationMapper
  ) {}

  @Auth(Role.viewer(Strategy.PARSE))
  @RejectPluginAuth()
  @Get('history')
  @ApiOperation({
    summary: "The caller's plugin history in this project",
    description:
      "Newest first: the caller's own installations, publications for this project and the caller's own, Verified listing changes, and updates and suspensions of those plugins. A Verified listing change shows for every project the listing is set to reach or has ever named. Events within the same second may come in either order.",
  })
  @ApiOkResponse({ type: PluginHistoryPageApiDto })
  async list(
    @AuthContext() context: AuthorizationContext,
    @Query() query: ListPluginHistoryQueryApiDto
  ): Promise<PluginHistoryPageApiDto> {
    const page = await this.listPluginHistoryService.run(
      this.mapper.toListPluginHistoryCommand(context, query)
    );
    return this.mapper.toPluginHistoryResponse(page);
  }
}
