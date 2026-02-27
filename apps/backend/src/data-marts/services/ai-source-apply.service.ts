import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { isUniqueConstraintViolation } from '../../common/typeorm/query-error.utils';
import type { AssistantProposedAction } from '../ai-insights/agent-flow/ai-assistant-types';
import {
  ApplyAiAssistantActionPayload,
  ApplyAiAssistantSessionCommand,
} from '../dto/domain/apply-ai-assistant-session.command';
import type {
  AiAssistantApplyStatus,
  ApplyAiAssistantActionType,
} from '../dto/domain/ai-assistant-apply.types';
import type { AiAssistantApplyActionResponse } from '../dto/domain/ai-assistant-apply-action-response.dto';
import { AiAssistantApplyResultDto } from '../dto/domain/ai-assistant-apply-result.dto';
import { AiAssistantApplyAction } from '../entities/ai-assistant-apply-action.entity';
import { AiAssistantApplyActionMapper } from '../mappers/ai-assistant-apply-action.mapper';
import { AiSourceApplyExecutionService } from './ai-source-apply-execution.service';
import { AiAssistantSessionService } from './ai-assistant-session.service';

interface LoadedApplyAction {
  entity: AiAssistantApplyAction;
  response: AiAssistantApplyActionResponse;
  action: ApplyAiAssistantActionPayload;
}

interface FinalizedApplyResult {
  dto: AiAssistantApplyResultDto;
  response: AiAssistantApplyActionResponse;
}

@Injectable()
export class AiSourceApplyService {
  private readonly logger = new Logger(AiSourceApplyService.name);

  constructor(
    @InjectRepository(AiAssistantApplyAction)
    private readonly applyActionRepository: Repository<AiAssistantApplyAction>,
    private readonly applyExecutionService: AiSourceApplyExecutionService,
    private readonly applyActionMapper: AiAssistantApplyActionMapper,
    private readonly aiAssistantSessionService: AiAssistantSessionService
  ) {}

  async listAppliedBySession(
    sessionId: string,
    createdById: string
  ): Promise<
    Array<{
      actionType: string | null;
      sourceKey: string | null;
      artifactTitle: string | null;
      templateUpdated: boolean;
      appliedAt: Date;
    }>
  > {
    const actions = await this.applyActionRepository.find({
      where: { sessionId, createdById },
      order: { modifiedAt: 'ASC' },
    });

    return actions
      .filter(a => a.response?.lifecycleStatus === 'applied')
      .map(a => ({
        actionType: a.response?.actionType ?? null,
        sourceKey: a.response?.sourceKey ?? null,
        artifactTitle: a.response?.artifactTitle ?? null,
        templateUpdated: a.response?.templateUpdated ?? false,
        appliedAt: a.modifiedAt,
      }));
  }

  @Transactional()
  async apply(command: ApplyAiAssistantSessionCommand): Promise<AiAssistantApplyResultDto> {
    let loadedAction = await this.loadApplyAction(command);
    if (loadedAction?.response.lifecycleStatus === 'applied') {
      const existing: FinalizedApplyResult = {
        dto: this.applyActionMapper.toResult(loadedAction.response),
        response: loadedAction.response,
      };
      this.logApplyDecision({
        command,
        resultStatus: existing.dto.status,
        reason: existing.dto.reason,
        actionType: existing.response.actionType ?? loadedAction.action.type,
        targetArtifactId:
          existing.response.targetArtifactId ?? loadedAction.action.targetArtifactId ?? null,
        templateSourceId: existing.response.templateSourceId ?? null,
        sourceKey: existing.response.sourceKey ?? loadedAction.action.sourceKey ?? null,
      });
      return existing.dto;
    }

    const session = await this.applyExecutionService.getSession(command);
    await this.ensureLatestSessionAction(command);
    if (!loadedAction) {
      loadedAction = await this.createApplyActionFromAssistantMessage(command);
    }
    if (
      loadedAction.response.assistantMessageId &&
      loadedAction.response.assistantMessageId !== command.assistantMessageId
    ) {
      throw new ConflictException({
        message: 'assistantMessageId conflicts with selected action',
      });
    }

    const action = loadedAction.action;
    const executionResult = await this.applyExecutionService.execute(session, command, action);

    const result = new AiAssistantApplyResultDto(
      command.requestId,
      executionResult.artifactId,
      executionResult.artifactTitle,
      executionResult.templateUpdated,
      executionResult.templateId,
      executionResult.sourceKey,
      executionResult.status,
      executionResult.reason
    );

    await this.applyActionRepository.update(
      { id: loadedAction.entity.id },
      {
        response: this.applyActionMapper.toStoredResponse(result, {
          lifecycleStatus: 'applied',
          assistantMessageId:
            loadedAction.response.assistantMessageId ?? command.assistantMessageId,
          action,
          targetArtifactId:
            action.targetArtifactId ?? loadedAction.response.targetArtifactId ?? null,
          templateSourceId: loadedAction.response.templateSourceId,
        }) as unknown as never,
      }
    );

    this.logApplyDecision({
      command,
      resultStatus: result.status,
      reason: result.reason,
      actionType: action.type,
      targetArtifactId: action.targetArtifactId ?? loadedAction.response.targetArtifactId ?? null,
      templateSourceId: loadedAction.response.templateSourceId ?? null,
      sourceKey: result.sourceKey ?? action.sourceKey ?? null,
    });

    return result;
  }

  private async loadApplyAction(
    command: ApplyAiAssistantSessionCommand
  ): Promise<LoadedApplyAction | null> {
    const existing = await this.applyActionRepository.findOne({
      where: {
        sessionId: command.sessionId,
        requestId: command.requestId,
        createdById: command.userId,
      },
    });

    if (!existing?.response) {
      return null;
    }

    const action = this.applyActionMapper.mapStoredResponseToPayload(existing.response);
    if (!action) {
      throw new BusinessViolationException('Apply action is malformed');
    }

    const lifecycleStatus = existing.response.lifecycleStatus;
    if (lifecycleStatus !== 'created' && lifecycleStatus !== 'applied') {
      throw new BusinessViolationException('Unsupported apply action lifecycle status');
    }

    return {
      entity: existing,
      response: existing.response,
      action,
    };
  }

  private async createApplyActionFromAssistantMessage(
    command: ApplyAiAssistantSessionCommand
  ): Promise<LoadedApplyAction> {
    const assistantMessage =
      await this.aiAssistantSessionService.getAssistantMessageByIdAndSessionId(
        command.assistantMessageId,
        command.sessionId
      );
    const proposedAction = this.findProposedActionByRequestId(
      assistantMessage.proposedActions,
      command.requestId
    );
    if (!proposedAction) {
      throw new NotFoundException(`Apply action with id ${command.requestId} is not found`);
    }

    const createdResponse = this.applyActionMapper.toCreatedResponseFromProposedAction({
      assistantMessageId: assistantMessage.id,
      proposedAction,
    });
    if (!createdResponse) {
      throw new BusinessViolationException('Apply action is malformed');
    }

    try {
      await this.applyActionRepository.insert({
        sessionId: command.sessionId,
        requestId: command.requestId,
        createdById: command.userId,
        response: createdResponse as unknown as never,
      });
    } catch (error: unknown) {
      if (!isUniqueConstraintViolation(error)) {
        throw error;
      }
    }

    const loadedAction = await this.loadApplyAction(command);
    if (!loadedAction) {
      throw new NotFoundException(`Apply action with id ${command.requestId} is not found`);
    }

    return loadedAction;
  }

  private findProposedActionByRequestId(
    proposedActions: AssistantProposedAction[] | null | undefined,
    requestId: string
  ): AssistantProposedAction | null {
    if (!Array.isArray(proposedActions)) {
      return null;
    }

    return proposedActions.find(action => action.id === requestId) ?? null;
  }

  private async ensureLatestSessionAction(command: ApplyAiAssistantSessionCommand): Promise<void> {
    const latestMessage =
      await this.aiAssistantSessionService.getLatestAssistantMessageWithProposedActionsBySession(
        command.sessionId
      );

    if (!latestMessage) {
      throw new BadRequestException('No active action to apply');
    }

    const latestRequestIds = this.findProposedActionRequestIds(latestMessage.proposedActions);
    const isLatest =
      latestMessage.id === command.assistantMessageId &&
      latestRequestIds.includes(command.requestId);
    if (isLatest) {
      return;
    }

    throw new BadRequestException(
      'Apply action is outdated. Please apply the latest action from the session.'
    );
  }

  private findProposedActionRequestIds(
    proposedActions: AssistantProposedAction[] | null | undefined
  ): string[] {
    if (!Array.isArray(proposedActions)) {
      return [];
    }

    return proposedActions
      .map(action => action?.id)
      .filter((actionId): actionId is string => Boolean(actionId));
  }

  private logApplyDecision(params: {
    command: ApplyAiAssistantSessionCommand;
    resultStatus: AiAssistantApplyStatus;
    reason: string | null;
    actionType?: ApplyAiAssistantActionType;
    targetArtifactId?: string | null;
    templateSourceId?: string | null;
    sourceKey?: string | null;
  }): void {
    this.logger.log('ai_source_apply_decision', {
      sessionId: params.command.sessionId,
      requestId: params.command.requestId,
      assistantMessageId: params.command.assistantMessageId,
      actionType: params.actionType ?? null,
      targetArtifactId: params.targetArtifactId ?? null,
      templateSourceId: params.templateSourceId ?? null,
      sourceKey: params.sourceKey ?? null,
      resultStatus: params.resultStatus,
      reason: params.reason,
    });
  }
}
