import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, type AuthorizationContext, RejectPluginAuth } from '../../idp';
import { Role, Strategy } from '../../idp/types/role-config.types';
import {
  CheckPluginReleaseApiDto,
  PluginReleaseCheckResultApiDto,
} from '../dto/presentation/publication-api.dto';
import { PluginPresentationMapper } from '../mappers/plugin-presentation.mapper';
import { CheckPluginReleaseService } from '../use-cases/check-plugin-release.service';

// No PluginHostExceptionFilter: only publishers reach GitHub, so errors keep their detail.
@ApiTags('Plugins')
@Controller('plugins')
@RejectPluginAuth()
export class PluginReleaseCheckController {
  constructor(
    private readonly checkPluginReleaseService: CheckPluginReleaseService,
    private readonly mapper: PluginPresentationMapper
  ) {}

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Post('check')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Check a release before publishing it',
    description:
      'Dry run: reports whether a release from this ref would be accepted, using the same rules as release sync, and records nothing. For deployment publishers and members who manage a publication of the plugin. Uses cached repository identity. Rate-limited per plugin and caller, separately from Check now.',
  })
  @ApiOkResponse({ type: PluginReleaseCheckResultApiDto })
  async check(
    @AuthContext() context: AuthorizationContext,
    @Body() dto: CheckPluginReleaseApiDto
  ): Promise<PluginReleaseCheckResultApiDto> {
    const result = await this.checkPluginReleaseService.run(
      this.mapper.toCheckReleaseCommand(context, dto)
    );
    return this.mapper.toReleaseCheckResponse(result);
  }
}
