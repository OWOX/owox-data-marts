import { Controller, Get, Param, UseFilters } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, type AuthorizationContext } from '../../idp';
import { Role, Strategy } from '../../idp/types/role-config.types';
import { PluginGalleryEntryApiDto } from '../dto/presentation/plugin-gallery-api.dto';
import { PluginHostExceptionFilter } from '../filters/plugin-host-exception.filter';
import { PluginPresentationMapper } from '../mappers/plugin-presentation.mapper';
import { GetPluginDetailsService } from '../use-cases/get-plugin-details.service';
import { GetPluginGalleryService } from '../use-cases/get-plugin-gallery.service';

/**
 * Member-facing plugin discovery.
 *
 * Every route here answers an ordinary member, so the whole controller is behind the
 * plugin host filter: source diagnostics must never reach this audience, whichever
 * layer raised them.
 */
@ApiTags('Plugins')
@Controller('plugins')
@UseFilters(PluginHostExceptionFilter)
export class PluginGalleryController {
  constructor(
    private readonly getPluginGalleryService: GetPluginGalleryService,
    private readonly getPluginDetailsService: GetPluginDetailsService,
    private readonly mapper: PluginPresentationMapper
  ) {}

  @Auth(Role.viewer(Strategy.PARSE))
  @Get('gallery')
  @ApiOperation({
    summary: 'Plugins visible to the current member in the current project',
    description:
      'Combines deployment, project and member publications into one deduplicated list. A plugin exposed at several levels appears once.',
  })
  @ApiOkResponse({ type: [PluginGalleryEntryApiDto] })
  async gallery(@AuthContext() context: AuthorizationContext): Promise<PluginGalleryEntryApiDto[]> {
    const result = await this.getPluginGalleryService.run(
      this.mapper.toGetPluginGalleryCommand(context)
    );
    return this.mapper.toGalleryEntryResponseList(result);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get(':pluginId')
  @ApiOperation({
    summary: 'One plugin, by id',
    description:
      'A direct link is a discovery path in its own right, so this resolves even when no publication makes the plugin visible to the caller.',
  })
  @ApiOkResponse({ type: PluginGalleryEntryApiDto })
  async details(
    @AuthContext() context: AuthorizationContext,
    @Param('pluginId') pluginId: string
  ): Promise<PluginGalleryEntryApiDto> {
    const result = await this.getPluginDetailsService.run(
      this.mapper.toGetPluginDetailsCommand(pluginId, context)
    );
    return this.mapper.toGalleryEntryResponse(result);
  }
}
