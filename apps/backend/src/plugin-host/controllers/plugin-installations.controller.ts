import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
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
import {
  Auth,
  AuthContext,
  RejectApiKeyAuth,
  RejectPluginAuth,
  type AuthorizationContext,
} from '../../idp';
import { Role, Strategy } from '../../idp/types/role-config.types';
import {
  InstallPluginApiDto,
  InstalledPluginApiDto,
  PluginEntryApiDto,
  PluginInstallationApiDto,
  PluginRuntimeTokenApiDto,
  PluginUpdateResultApiDto,
} from '../dto/presentation/plugin-installation-api.dto';
import { UpdatePluginByRepositoryApiDto } from '../dto/presentation/publication-api.dto';
import { PluginHostExceptionFilter } from '../filters/plugin-host-exception.filter';
import { PluginPresentationMapper } from '../mappers/plugin-presentation.mapper';
import { GetPluginInstallationEntryService } from '../use-cases/get-plugin-installation-entry.service';
import { InstallPluginService } from '../use-cases/install-plugin.service';
import { ListInstallationsService } from '../use-cases/list-installations.service';
import { IssuePluginRuntimeTokenService } from '../use-cases/issue-plugin-runtime-token.service';
import { UninstallPluginService } from '../use-cases/uninstall-plugin.service';
import { UpdatePluginService } from '../use-cases/update-plugin.service';

/**
 * A member's own installations.
 *
 * Everything here answers an ordinary member, so the whole controller sits behind the
 * plugin host filter: source diagnostics must not escape through an installation error
 * any more than through the Gallery.
 *
 * Every action that mutates the plugin lifecycle rejects plugin runtime tokens. A runtime
 * token carries the member's own authority by design (§14), which is exactly why the
 * plugin must not be able to spend it here: installing another plugin, uninstalling
 * itself, or activating a new version for every installation in the deployment are
 * decisions of the member at the keyboard, not of the third-party page they opened. The
 * reads stay open -- a plugin learning its own delivery URL tells it nothing new.
 */
@ApiTags('Plugins')
@Controller('plugins')
@UseFilters(PluginHostExceptionFilter)
export class PluginInstallationsController {
  constructor(
    private readonly installPluginService: InstallPluginService,
    private readonly uninstallPluginService: UninstallPluginService,
    private readonly listInstallationsService: ListInstallationsService,
    private readonly getPluginInstallationEntryService: GetPluginInstallationEntryService,
    private readonly updatePluginService: UpdatePluginService,
    private readonly issuePluginRuntimeTokenService: IssuePluginRuntimeTokenService,
    private readonly mapper: PluginPresentationMapper
  ) {}

  @Auth(Role.viewer(Strategy.PARSE))
  @Get('installations')
  @ApiOperation({
    summary: "The caller's installations in this project",
    description:
      'With includeUninstalled, this is the installation history -- and the only route back to a plugin whose publication has since been withdrawn, because such a plugin no longer appears in the Gallery.',
  })
  @ApiQuery({ name: 'includeUninstalled', required: false, type: Boolean })
  @ApiOkResponse({ type: [InstalledPluginApiDto] })
  async list(
    @AuthContext() context: AuthorizationContext,
    @Query('includeUninstalled') includeUninstalled?: string
  ): Promise<InstalledPluginApiDto[]> {
    const result = await this.listInstallationsService.run(
      this.mapper.toListInstallationsCommand(context, includeUninstalled === 'true')
    );
    return this.mapper.toInstalledPluginResponseList(result);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get('installations/:installationId/entry')
  @ApiOperation({
    summary: 'Where to point the iframe for one active installation',
    description:
      "The only member-facing response carrying a delivery URL, and only for the caller's own live installation. It is a runtime bootstrap rather than a product view.",
  })
  @ApiOkResponse({ type: PluginEntryApiDto })
  async entry(
    @AuthContext() context: AuthorizationContext,
    @Param('installationId') installationId: string
  ): Promise<PluginEntryApiDto> {
    const result = await this.getPluginInstallationEntryService.run(
      this.mapper.toGetPluginInstallationEntryCommand(installationId, context)
    );
    return this.mapper.toInstallationEntryResponse(result);
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @RejectApiKeyAuth()
  @RejectPluginAuth()
  @Post('installations/:installationId/runtime-token')
  @HttpCode(200)
  @ApiOperation({ summary: 'Issue a runtime access token for one active installation' })
  @ApiOkResponse({ type: PluginRuntimeTokenApiDto })
  async runtimeToken(
    @AuthContext() context: AuthorizationContext,
    @Param('installationId') installationId: string
  ): Promise<PluginRuntimeTokenApiDto> {
    return this.issuePluginRuntimeTokenService.run(installationId, context);
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @RejectPluginAuth()
  @Post(':pluginId/installation')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Install or restore a plugin for the caller',
    description:
      'expectedVersionId must match the version the member was shown; if the plugin moved on in the meantime the confirmation is rejected and the new version returned.',
  })
  @ApiOkResponse({ type: PluginInstallationApiDto })
  async install(
    @AuthContext() context: AuthorizationContext,
    @Param('pluginId') pluginId: string,
    @Body() dto: InstallPluginApiDto
  ): Promise<PluginInstallationApiDto> {
    const result = await this.installPluginService.run(
      this.mapper.toInstallCommand(pluginId, context, dto)
    );
    return this.mapper.toInstallationResponse(result);
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @RejectPluginAuth()
  @Post('update')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Check now, by repository',
    description:
      'CLI / api-client form of Check now. Same rules as the per-plugin route. Uses cached repository identity; the plugin must already be known to this deployment.',
  })
  @ApiOkResponse({ type: PluginUpdateResultApiDto })
  async updateByRepository(
    @AuthContext() context: AuthorizationContext,
    @Body() dto: UpdatePluginByRepositoryApiDto
  ): Promise<PluginUpdateResultApiDto> {
    const result = await this.updatePluginService.run(
      this.mapper.toUpdateByRepositoryCommand(context, dto)
    );
    return this.mapper.toUpdateResultResponse(result);
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @RejectPluginAuth()
  @Post(':pluginId/update')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Check now',
    description:
      "Accelerates the deployment's daily update check rather than deciding it: a valid higher version becomes current immediately for every active installation in every project, and the plugin's own daily slot does not move. Available while the plugin is suspended, but does not lift a suspension. Rate-limited per plugin and safe to repeat.",
  })
  @ApiOkResponse({ type: PluginUpdateResultApiDto })
  async update(
    @AuthContext() context: AuthorizationContext,
    @Param('pluginId') pluginId: string
  ): Promise<PluginUpdateResultApiDto> {
    const result = await this.updatePluginService.run(
      this.mapper.toUpdateCommand(pluginId, context)
    );
    return this.mapper.toUpdateResultResponse(result);
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @RejectPluginAuth()
  @Delete(':pluginId/installation')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Stop a plugin for the caller',
    description:
      'Soft: the record and its history survive so it can be restored later. Changes no publication, affects no other member, and stays available while the plugin is suspended.',
  })
  @ApiNoContentResponse()
  async uninstall(
    @AuthContext() context: AuthorizationContext,
    @Param('pluginId') pluginId: string
  ): Promise<void> {
    await this.uninstallPluginService.run(this.mapper.toUninstallCommand(pluginId, context));
  }
}
