import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, AuthorizationContext, Role, Strategy } from '../../idp';
import { AiAssistantMapper } from '../mappers/ai-assistant.mapper';
import { ApplyAiAssistantSessionService } from '../use-cases/apply-ai-assistant-session.service';
import { CreateAiAssistantMessageService } from '../use-cases/create-ai-assistant-message.service';
import { CreateAiAssistantSessionService } from '../use-cases/create-ai-assistant-session.service';
import { DeleteAiAssistantSessionService } from '../use-cases/delete-ai-assistant-session.service';
import { GetAiAssistantSessionService } from '../use-cases/get-ai-assistant-session.service';
import { ListAiAssistantSessionsService } from '../use-cases/list-ai-assistant-sessions.service';
import { UpdateAiAssistantSessionTitleService } from '../use-cases/update-ai-assistant-session-title.service';
import { AiAssistantSessionListItemResponseApiDto } from '../dto/presentation/ai-assistant-session-list-item-response-api.dto';
import { AiAssistantSessionResponseApiDto } from '../dto/presentation/ai-assistant-session-response-api.dto';
import { ApplyAiAssistantSessionRequestApiDto } from '../dto/presentation/apply-ai-assistant-session-request-api.dto';
import { ApplyAiAssistantSessionResponseApiDto } from '../dto/presentation/apply-ai-assistant-session-response-api.dto';
import { CreateAiAssistantMessageRequestApiDto } from '../dto/presentation/create-ai-assistant-message-request-api.dto';
import { CreateAiAssistantMessageResponseApiDto } from '../dto/presentation/create-ai-assistant-message-response-api.dto';
import { CreateAiAssistantSessionRequestApiDto } from '../dto/presentation/create-ai-assistant-session-request-api.dto';
import { CreateAiAssistantSessionResponseApiDto } from '../dto/presentation/create-ai-assistant-session-response-api.dto';
import { ListAiAssistantSessionsQueryApiDto } from '../dto/presentation/list-ai-assistant-sessions-query-api.dto';
import { UpdateAiAssistantSessionTitleRequestApiDto } from '../dto/presentation/update-ai-assistant-session-title-request-api.dto';
import {
  ApplyAiAssistantSessionSpec,
  CreateAiAssistantMessageSpec,
  CreateAiAssistantSessionSpec,
  DeleteAiAssistantSessionSpec,
  GetAiAssistantSessionSpec,
  ListAiAssistantSessionsSpec,
  UpdateAiAssistantSessionTitleSpec,
} from './spec/ai-assistant.api';

@Controller('data-marts/:dataMartId/ai-assistant')
@ApiTags('Insights')
export class AiAssistantController {
  constructor(
    private readonly createAiAssistantSessionService: CreateAiAssistantSessionService,
    private readonly listAiAssistantSessionsService: ListAiAssistantSessionsService,
    private readonly getAiAssistantSessionService: GetAiAssistantSessionService,
    private readonly updateAiAssistantSessionTitleService: UpdateAiAssistantSessionTitleService,
    private readonly deleteAiAssistantSessionService: DeleteAiAssistantSessionService,
    private readonly createAiAssistantMessageService: CreateAiAssistantMessageService,
    private readonly applyAiAssistantSessionService: ApplyAiAssistantSessionService,
    private readonly mapper: AiAssistantMapper
  ) {}

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Post('sessions')
  @CreateAiAssistantSessionSpec()
  async createSession(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Body() dto: CreateAiAssistantSessionRequestApiDto
  ): Promise<CreateAiAssistantSessionResponseApiDto> {
    const command = this.mapper.toCreateSessionCommand(dataMartId, context, dto);
    const session = await this.createAiAssistantSessionService.run(command);

    return this.mapper.toCreateSessionResponse(session.id);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get('sessions')
  @ListAiAssistantSessionsSpec()
  async listSessions(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Query() query: ListAiAssistantSessionsQueryApiDto
  ): Promise<AiAssistantSessionListItemResponseApiDto[]> {
    const command = this.mapper.toListSessionsCommand({
      dataMartId,
      context,
      scope: query.scope,
      templateId: query.templateId,
      limit: query.limit,
      offset: query.offset,
    });
    const sessions = await this.listAiAssistantSessionsService.run(command);
    return this.mapper.toSessionListItemResponseList(sessions);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get('sessions/:sessionId')
  @GetAiAssistantSessionSpec()
  async getSession(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Param('sessionId') sessionId: string
  ): Promise<AiAssistantSessionResponseApiDto> {
    const command = this.mapper.toGetSessionCommand(sessionId, dataMartId, context);
    const session = await this.getAiAssistantSessionService.run(command);

    return this.mapper.toSessionResponse(session);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Patch('sessions/:sessionId/title')
  @UpdateAiAssistantSessionTitleSpec()
  async updateSessionTitle(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: UpdateAiAssistantSessionTitleRequestApiDto
  ): Promise<AiAssistantSessionListItemResponseApiDto> {
    const command = this.mapper.toUpdateSessionTitleCommand(sessionId, dataMartId, context, dto);
    const session = await this.updateAiAssistantSessionTitleService.run(command);
    return this.mapper.toSessionListItemResponse(session);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Delete('sessions/:sessionId')
  @DeleteAiAssistantSessionSpec()
  @HttpCode(204)
  async deleteSession(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Param('sessionId') sessionId: string
  ): Promise<void> {
    const command = this.mapper.toDeleteSessionCommand(sessionId, dataMartId, context);
    await this.deleteAiAssistantSessionService.run(command);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Post('sessions/:sessionId/messages')
  @CreateAiAssistantMessageSpec()
  async createMessage(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: CreateAiAssistantMessageRequestApiDto
  ): Promise<CreateAiAssistantMessageResponseApiDto> {
    const command = this.mapper.toCreateMessageCommand(sessionId, dataMartId, context, dto);
    const result = await this.createAiAssistantMessageService.run(command);

    return this.mapper.toCreateMessageResponse(result);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Post('sessions/:sessionId/apply')
  @ApplyAiAssistantSessionSpec()
  async apply(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: ApplyAiAssistantSessionRequestApiDto
  ): Promise<ApplyAiAssistantSessionResponseApiDto> {
    const command = this.mapper.toApplySessionCommand(sessionId, dataMartId, context, dto);
    const result = await this.applyAiAssistantSessionService.run(command);

    return this.mapper.toApplySessionResponse(result);
  }
}
