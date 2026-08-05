import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, type AuthorizationContext, RejectPluginAuth } from '../../idp';
import { Role, Strategy } from '../../idp/types/role-config.types';
import {
  PluginSuspensionResponseApiDto,
  SuspendPluginApiDto,
} from '../dto/presentation/plugin-suspension-api.dto';
import { PluginPresentationMapper } from '../mappers/plugin-presentation.mapper';
import { ResumePluginService } from '../use-cases/resume-plugin.service';
import { SuspendPluginService } from '../use-cases/suspend-plugin.service';

/**
 * The deployment-wide emergency controls.
 *
 * Authorization is the publisher allowlist, checked inside the use case: the deciding
 * factor is which API key is calling, which no role decorator can express. Both routes
 * are POST because both carry a body and neither is a resource deletion.
 */
@ApiTags('Plugins')
@Controller('plugins')
// Suspend and resume are deployment-publisher operations; a plugin runtime token is refused
// here as well as by the publisher-key check, so the refusal is a guard decision, not a
// deeper one.
@RejectPluginAuth()
export class PluginAdminController {
  constructor(
    private readonly suspendPluginService: SuspendPluginService,
    private readonly resumePluginService: ResumePluginService,
    private readonly mapper: PluginPresentationMapper
  ) {}

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Post('suspend')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Suspend a plugin across the whole deployment',
    description:
      'Blocks opening, installing and restoring. Uninstalling and updating stay available, publications and installations are untouched, and the Gallery keeps listing the plugin as temporarily unavailable. Soft and idempotent.',
  })
  @ApiOkResponse({ type: PluginSuspensionResponseApiDto })
  async suspend(
    @AuthContext() context: AuthorizationContext,
    @Body() dto: SuspendPluginApiDto
  ): Promise<PluginSuspensionResponseApiDto> {
    const result = await this.suspendPluginService.run(this.mapper.toSuspendCommand(context, dto));
    return this.mapper.toSuspensionResponse(result);
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Post('resume')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Lift a suspension',
    description:
      'Re-enables active installations on whatever version is current now, which may have moved on during the suspension because updates stay available throughout it.',
  })
  @ApiOkResponse({ type: PluginSuspensionResponseApiDto })
  async resume(
    @AuthContext() context: AuthorizationContext,
    @Body() dto: SuspendPluginApiDto
  ): Promise<PluginSuspensionResponseApiDto> {
    const result = await this.resumePluginService.run(this.mapper.toResumeCommand(context, dto));
    return this.mapper.toSuspensionResponse(result);
  }
}
