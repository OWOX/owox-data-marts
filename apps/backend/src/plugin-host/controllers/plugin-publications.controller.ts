import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, type AuthorizationContext, RejectPluginAuth } from '../../idp';
import { Role, Strategy } from '../../idp/types/role-config.types';
import {
  PublicationResponseApiDto,
  PublishPluginApiDto,
} from '../dto/presentation/publication-api.dto';
import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';
import { PluginPresentationMapper } from '../mappers/plugin-presentation.mapper';
import { ListPublicationsService } from '../use-cases/list-publications.service';
import { PublishPluginService } from '../use-cases/publish-plugin.service';
import { UnpublishPluginService } from '../use-cases/unpublish-plugin.service';

/**
 * Publisher-facing catalog management.
 *
 * Every route is `Role.viewer` at the decorator level and authorized per scope inside
 * the use case, because the scope arrives in the body -- a decorator cannot see it.
 * Unpublish is a POST rather than a DELETE: the deployment audience form needs a body,
 * and DELETE with one is poorly supported across clients and proxies.
 */
@ApiTags('Plugins')
@Controller('plugins/publications')
// A plugin runtime token never manages publications: publishing, unpublishing and even
// listing what a member may manage are the member's decisions, not the third-party page's.
// The api-key path stays open, since owox-ctl drives these under a publisher key.
@RejectPluginAuth()
export class PluginPublicationsController {
  constructor(
    private readonly publishPluginService: PublishPluginService,
    private readonly unpublishPluginService: UnpublishPluginService,
    private readonly listPublicationsService: ListPublicationsService,
    private readonly mapper: PluginPresentationMapper
  ) {}

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Post()
  @ApiOperation({ summary: 'Publish a plugin to the Gallery at one authority level' })
  @ApiOkResponse({
    description: 'The publication, after being created or restored.',
    type: PublicationResponseApiDto,
  })
  async publish(
    @AuthContext() context: AuthorizationContext,
    @Body() dto: PublishPluginApiDto
  ): Promise<PublicationResponseApiDto> {
    const result = await this.publishPluginService.run(this.mapper.toPublishCommand(context, dto));
    return this.mapper.toPublicationResponse(result);
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Post('unpublish')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Remove a plugin listing, or part of a deployment audience',
    description:
      'Catalog-only. Installations are untouched, the plugin is not suspended, and other publications may keep it visible.',
  })
  @ApiOkResponse({
    description: 'The publication, after deactivation.',
    type: PublicationResponseApiDto,
  })
  async unpublish(
    @AuthContext() context: AuthorizationContext,
    @Body() dto: PublishPluginApiDto
  ): Promise<PublicationResponseApiDto> {
    const result = await this.unpublishPluginService.run(
      this.mapper.toUnpublishCommand(context, dto)
    );
    return this.mapper.toPublicationResponse(result);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get()
  @ApiOperation({ summary: 'List the publications the caller may manage at one scope' })
  @ApiQuery({ name: 'scope', enum: PluginPublicationScope })
  @ApiOkResponse({ type: [PublicationResponseApiDto] })
  async list(
    @AuthContext() context: AuthorizationContext,
    @Query('scope') scope: PluginPublicationScope
  ): Promise<PublicationResponseApiDto[]> {
    const result = await this.listPublicationsService.run(
      this.mapper.toListPublicationsCommand(context, scope)
    );
    return this.mapper.toPublicationResponseList(result);
  }
}
