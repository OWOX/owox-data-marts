import { Injectable } from '@nestjs/common';
import type { AssistantProposedAction } from '../ai-insights/agent-flow/ai-assistant-types';
import { AiAssistantApplyResultDto } from '../dto/domain/ai-assistant-apply-result.dto';
import type {
  AiAssistantApplyLifecycleStatus,
  AiAssistantApplyStatus,
  ApplyAiAssistantActionType,
} from '../dto/domain/ai-assistant-apply.types';
import type { ApplyAiAssistantActionPayload } from '../dto/domain/apply-ai-assistant-session.command';
import type { AiAssistantApplyActionResponse } from '../dto/domain/ai-assistant-apply-action-response.dto';
import {
  AiAssistantActionAppliedEvent,
  type AiAssistantActionAppliedEventPayload,
  type AiAssistantActionAppliedResultStatus,
} from '../events/ai-assistant-action-applied.event';
import type { TemplateEditPlaceholderTag } from '../services/template-edit-placeholder-tags/template-edit-placeholder-tags.contracts';

export interface AiAssistantApplyDecisionActionSnapshot {
  actionId: string;
  actionType: ApplyAiAssistantActionType;
  templateSourceId?: string;
  sourceKey?: string;
  insertTag?: boolean;
  text?: string;
  tags?: TemplateEditPlaceholderTag[];
}

export interface BuildCreatedApplyActionResponseParams {
  assistantMessageId: string;
  snapshotAction: AiAssistantApplyDecisionActionSnapshot;
  selectedAction: ApplyAiAssistantActionPayload;
}

export interface BuildStoredApplyActionResponseContext {
  lifecycleStatus: AiAssistantApplyLifecycleStatus;
  assistantMessageId: string | null;
  templateSourceId?: string | null;
  action: ApplyAiAssistantActionPayload | null;
}

export interface BuildActionAppliedEventParams {
  projectId: string;
  dataMartId: string;
  userId: string;
  sessionId: string;
  assistantMessageId: string;
  requestId: string;
  actionType: ApplyAiAssistantActionType | null;
  artifactId: string | null;
  artifactTitle: string | null;
  templateId: string | null;
  template?: string;
  sourceKey: string | null;
  templateUpdated: boolean;
  status?: AiAssistantApplyStatus | null;
  reason?: string | null;
  error?: string;
}

@Injectable()
export class AiAssistantApplyActionMapper {
  toResult(response: AiAssistantApplyActionResponse): AiAssistantApplyResultDto {
    return new AiAssistantApplyResultDto(
      response.requestId,
      response.artifactId,
      response.sourceTitle,
      response.templateUpdated,
      response.templateId,
      response.sourceKey,
      response.status ?? 'updated',
      response.reason ?? null
    );
  }

  mapStoredResponseToPayload(
    response: AiAssistantApplyActionResponse
  ): ApplyAiAssistantActionPayload | null {
    if (response.selectedAction) {
      return response.selectedAction;
    }

    if (!response.actionType) {
      return null;
    }

    return this.mapSnapshotActionToPayload({
      actionId: response.requestId,
      actionType: response.actionType,
      templateSourceId: response.templateSourceId ?? undefined,
      sourceKey: response.sourceKey ?? undefined,
      insertTag: response.insertTag ?? undefined,
    });
  }

  mapSnapshotActionToPayload(
    snapshotAction: AiAssistantApplyDecisionActionSnapshot
  ): ApplyAiAssistantActionPayload | null {
    switch (snapshotAction.actionType) {
      case 'update_existing_source':
        return {
          type: 'update_existing_source',
          sourceId: snapshotAction.templateSourceId,
          sourceKey: snapshotAction.sourceKey,
          text: snapshotAction.text,
          tags: snapshotAction.tags,
        };
      case 'create_and_attach_source':
        return {
          type: 'create_and_attach_source',
          sourceId: snapshotAction.templateSourceId,
          sourceKey: snapshotAction.sourceKey,
          insertTag: snapshotAction.insertTag,
          text: snapshotAction.text,
          tags: snapshotAction.tags,
        };
      case 'replace_template_document':
        return {
          type: 'replace_template_document',
          text: snapshotAction.text,
          tags: snapshotAction.tags,
        };
      case 'remove_source_from_template':
        return {
          type: 'remove_source_from_template',
          sourceKey: snapshotAction.sourceKey,
        };
      default:
        return null;
    }
  }

  toCreatedResponseFromProposedAction(params: {
    assistantMessageId: string;
    proposedAction: AssistantProposedAction;
  }): AiAssistantApplyActionResponse | null {
    const snapshotAction = this.mapProposedActionToSnapshotAction(params.proposedAction);
    if (!snapshotAction) {
      return null;
    }

    const selectedAction = this.mapSnapshotActionToPayload(snapshotAction);
    if (!selectedAction) {
      return null;
    }

    return this.toCreatedResponse({
      assistantMessageId: params.assistantMessageId,
      snapshotAction,
      selectedAction,
    });
  }

  toCreatedResponse(params: BuildCreatedApplyActionResponseParams): AiAssistantApplyActionResponse {
    const { snapshotAction } = params;

    return {
      requestId: snapshotAction.actionId,
      lifecycleStatus: 'created',
      artifactId: null,
      sourceTitle: null,
      templateUpdated: false,
      templateId: null,
      sourceKey: snapshotAction.sourceKey ?? null,
      assistantMessageId: params.assistantMessageId,
      actionType: snapshotAction.actionType,
      templateSourceId: snapshotAction.templateSourceId ?? null,
      insertTag: snapshotAction.insertTag ?? null,
      selectedAction: params.selectedAction,
      reason: null,
    };
  }

  toStoredResponse(
    result: AiAssistantApplyResultDto,
    context: BuildStoredApplyActionResponseContext
  ): AiAssistantApplyActionResponse {
    const action = context.action;

    return {
      requestId: result.requestId,
      lifecycleStatus: context.lifecycleStatus,
      artifactId: result.artifactId,
      sourceTitle: result.sourceTitle,
      templateUpdated: result.templateUpdated,
      templateId: result.templateId,
      sourceKey: result.sourceKey,
      assistantMessageId: context.assistantMessageId,
      actionType: action?.type ?? null,
      templateSourceId: context.templateSourceId ?? null,
      insertTag: action?.insertTag ?? null,
      selectedAction: action,
      status: result.status,
      reason: result.reason,
    };
  }

  toActionAppliedEvent(params: BuildActionAppliedEventParams): AiAssistantActionAppliedEvent {
    const resultStatus = this.normalizeActionAppliedResultStatus(params.status, params.error);
    const error =
      params.error ??
      (resultStatus === 'failed' ? (params.reason ?? 'AI assistant apply failed') : undefined);
    const payload: AiAssistantActionAppliedEventPayload = {
      projectId: params.projectId,
      dataMartId: params.dataMartId,
      userId: params.userId,
      sessionId: params.sessionId,
      assistantMessageId: params.assistantMessageId,
      requestId: params.requestId,
      actionType: params.actionType,
      resultStatus,
      artifactId: params.artifactId,
      artifactTitle: params.artifactTitle,
      templateId: params.templateId,
      sourceKey: params.sourceKey,
      templateUpdated: params.templateUpdated,
      ...(params.template !== undefined ? { template: params.template } : {}),
      ...(error ? { error } : {}),
    };

    return new AiAssistantActionAppliedEvent(payload);
  }

  private normalizeActionAppliedResultStatus(
    status?: AiAssistantApplyStatus | null,
    error?: string
  ): AiAssistantActionAppliedResultStatus {
    if (error || status === 'validation_failed') {
      return 'failed';
    }

    return 'successful';
  }

  private mapProposedActionToSnapshotAction(
    action: AssistantProposedAction
  ): AiAssistantApplyDecisionActionSnapshot | null {
    switch (action.type) {
      case 'apply_changes_to_source':
        return {
          actionId: action.id,
          actionType: 'update_existing_source',
          templateSourceId: action.payload.sourceId,
          sourceKey: action.payload.sourceKey,
          text: action.payload.text,
          tags: action.payload.tags,
        };
      case 'create_source_and_attach':
        return {
          actionId: action.id,
          actionType: 'create_and_attach_source',
          sourceKey: action.payload.suggestedSourceKey,
          text: action.payload.text,
          tags: action.payload.tags,
        };
      case 'attach_source_to_template':
        return {
          actionId: action.id,
          actionType: 'create_and_attach_source',
          sourceKey: action.payload.suggestedSourceKey,
          templateSourceId: action.payload.sourceId,
          insertTag: action.payload.insertTag ?? true,
          text: action.payload.text,
          tags: action.payload.tags,
        };
      case 'replace_template_document':
        return {
          actionId: action.id,
          actionType: 'replace_template_document',
          text: action.payload.text,
          tags: action.payload.tags,
        };
      case 'remove_source_from_template':
        return {
          actionId: action.id,
          actionType: 'remove_source_from_template',
          sourceKey: action.payload.sourceKey,
        };
      case 'reuse_source_without_changes':
        return {
          actionId: action.id,
          actionType: 'create_and_attach_source',
          templateSourceId: action.payload.sourceId,
          sourceKey: action.payload.sourceKey,
          text: action.payload.text,
          tags: action.payload.tags,
        };
      default:
        return null;
    }
  }
}
