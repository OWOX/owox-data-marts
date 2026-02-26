import { Injectable } from '@nestjs/common';
import type { AssistantProposedAction } from '../ai-insights/agent-flow/ai-assistant-types';
import { AiAssistantApplyResultDto } from '../dto/domain/ai-assistant-apply-result.dto';
import type {
  AiAssistantApplyLifecycleStatus,
  ApplyAiAssistantActionType,
} from '../dto/domain/ai-assistant-apply.types';
import type { ApplyAiAssistantActionPayload } from '../dto/domain/apply-ai-assistant-session.command';
import type { AiAssistantApplyActionResponse } from '../dto/domain/ai-assistant-apply-action-response.dto';
import type { TemplateEditPlaceholderTag } from '../services/template-edit-placeholder-tags/template-edit-placeholder-tags.contracts';

export interface AiAssistantApplyDecisionActionSnapshot {
  actionId: string;
  actionType: ApplyAiAssistantActionType;
  targetArtifactId?: string;
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
  targetArtifactId?: string | null;
  templateSourceId?: string | null;
  action: ApplyAiAssistantActionPayload | null;
}

@Injectable()
export class AiAssistantApplyActionMapper {
  toResult(response: AiAssistantApplyActionResponse): AiAssistantApplyResultDto {
    return new AiAssistantApplyResultDto(
      response.requestId,
      response.artifactId,
      response.artifactTitle,
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
      targetArtifactId: response.targetArtifactId ?? undefined,
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
          sourceKey: snapshotAction.sourceKey,
          targetArtifactId: snapshotAction.targetArtifactId,
          text: snapshotAction.text,
          tags: snapshotAction.tags,
        };
      case 'create_and_attach_source':
        return {
          type: 'create_and_attach_source',
          sourceKey: snapshotAction.sourceKey,
          targetArtifactId: snapshotAction.targetArtifactId,
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
      artifactTitle: null,
      templateUpdated: false,
      templateId: null,
      sourceKey: snapshotAction.sourceKey ?? null,
      assistantMessageId: params.assistantMessageId,
      actionType: snapshotAction.actionType,
      targetArtifactId: snapshotAction.targetArtifactId ?? null,
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
      artifactTitle: result.artifactTitle,
      templateUpdated: result.templateUpdated,
      templateId: result.templateId,
      sourceKey: result.sourceKey,
      assistantMessageId: context.assistantMessageId,
      actionType: action?.type ?? null,
      targetArtifactId: context.targetArtifactId ?? action?.targetArtifactId ?? null,
      templateSourceId: context.templateSourceId ?? null,
      insertTag: action?.insertTag ?? null,
      selectedAction: action,
      status: result.status,
      reason: result.reason,
    };
  }

  private mapProposedActionToSnapshotAction(
    action: AssistantProposedAction
  ): AiAssistantApplyDecisionActionSnapshot | null {
    switch (action.type) {
      case 'apply_changes_to_source':
        return {
          actionId: action.id,
          actionType: 'update_existing_source',
          targetArtifactId: action.payload.artifactId,
          templateSourceId: action.payload.sourceId,
          sourceKey: action.payload.sourceKey,
          text: action.payload.text,
          tags: action.payload.tags,
        };
      case 'apply_sql_to_artifact':
        return {
          actionId: action.id,
          actionType: 'update_existing_source',
          targetArtifactId: action.payload.artifactId,
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
          targetArtifactId: action.payload.targetArtifactId,
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
          targetArtifactId: action.payload.artifactId,
          text: action.payload.text,
          tags: action.payload.tags,
        };
      default:
        return null;
    }
  }
}
