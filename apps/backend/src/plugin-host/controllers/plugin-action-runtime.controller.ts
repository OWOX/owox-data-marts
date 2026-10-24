import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseFilters,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiAcceptedResponse, ApiBody, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, RequirePluginAuth, type AuthorizationContext } from '../../idp';
import { Role, Strategy } from '../../idp/types/role-config.types';
import {
  CancelPluginActionExecutionCommand,
  GetCurrentPluginActionExecutionCommand,
  GetPluginActionExecutionCommand,
  StartPluginActionExecutionCommand,
} from '../dto/domain/plugin-action-execution.command';
import {
  PluginActionExecutionApiDto,
  PluginActionExecutionQueryApiDto,
  PluginActionWorkerContextApiDto,
  StartedPluginActionExecutionApiDto,
  StartPluginActionExecutionApiDto,
} from '../dto/presentation/plugin-action-api.dto';
import { PluginHostExceptionFilter } from '../filters/plugin-host-exception.filter';
import { PluginPresentationMapper } from '../mappers/plugin-presentation.mapper';
import { CancelPluginActionExecutionService } from '../use-cases/cancel-plugin-action-execution.service';
import { GetCurrentPluginActionExecutionService } from '../use-cases/get-current-plugin-action-execution.service';
import { GetPluginActionExecutionService } from '../use-cases/get-plugin-action-execution.service';
import { StartPluginActionExecutionService } from '../use-cases/start-plugin-action-execution.service';
import { requestAbortSignal } from '../utils/request-abort-signal.util';

@ApiTags('Plugin Actions')
@Controller('plugins/runtime')
@Auth(Role.viewer(Strategy.PARSE))
@RequirePluginAuth()
@UseFilters(PluginHostExceptionFilter)
export class PluginActionRuntimeController {
  constructor(
    private readonly startExecution: StartPluginActionExecutionService,
    private readonly getExecution: GetPluginActionExecutionService,
    private readonly cancelExecution: CancelPluginActionExecutionService,
    private readonly getCurrentExecution: GetCurrentPluginActionExecutionService,
    private readonly mapper: PluginPresentationMapper
  ) {}

  @Post('actions/:action/executions')
  @HttpCode(202)
  @ApiBody({ type: StartPluginActionExecutionApiDto })
  @ApiAcceptedResponse({ type: StartedPluginActionExecutionApiDto })
  async start(
    @Param('action') action: string,
    // Not a DTO: the global pipe would drop `constructor`, `prototype` and `__proto__` at any depth.
    @Body() body: Record<string, unknown> | undefined,
    @AuthContext() context: AuthorizationContext
  ): Promise<StartedPluginActionExecutionApiDto> {
    const unknownProperty = Object.keys(body ?? {}).find(key => key !== 'input');
    if (unknownProperty !== undefined) {
      throw new BadRequestException([`property ${unknownProperty} should not exist`]);
    }
    const started = await this.startExecution.run(
      new StartPluginActionExecutionCommand(context, action, body?.input)
    );
    return this.mapper.toStartedActionExecutionResponse(started);
  }

  // Before 'executions/:id': Nest matches routes in declaration order.
  @Get('executions/current')
  @ApiQuery({
    name: 'capabilities',
    required: false,
    example: 'ai',
    description: 'What the calling SDK supports. `ai` adds the AI Credential handles.',
  })
  @ApiOkResponse({ type: PluginActionWorkerContextApiDto })
  async current(
    @AuthContext() context: AuthorizationContext,
    @Query('capabilities') capabilities?: string | string[]
  ): Promise<PluginActionWorkerContextApiDto> {
    const current = await this.getCurrentExecution.run(
      new GetCurrentPluginActionExecutionCommand(
        context,
        String(capabilities ?? '')
          .split(',')
          .includes('ai')
      )
    );
    return this.mapper.toActionWorkerContextResponse(current);
  }

  @Get('executions/:id')
  @ApiOkResponse({ type: PluginActionExecutionApiDto })
  async get(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PluginActionExecutionQueryApiDto,
    @AuthContext() context: AuthorizationContext,
    @Req() request: Request
  ): Promise<PluginActionExecutionApiDto> {
    const disconnected = requestAbortSignal(request);
    try {
      const execution = await this.getExecution.run(
        new GetPluginActionExecutionCommand(
          context,
          id,
          query.waitSeconds ?? 0,
          disconnected.signal
        )
      );
      return this.mapper.toActionExecutionResponse(execution);
    } finally {
      disconnected.dispose();
    }
  }

  @Post('executions/:id/cancel')
  @HttpCode(200)
  @ApiOkResponse({ type: PluginActionExecutionApiDto })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthContext() context: AuthorizationContext
  ): Promise<PluginActionExecutionApiDto> {
    const execution = await this.cancelExecution.run(
      new CancelPluginActionExecutionCommand(context, id)
    );
    return this.mapper.toActionExecutionResponse(execution);
  }
}
