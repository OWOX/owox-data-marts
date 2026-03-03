import { Injectable } from '@nestjs/common';
import type { AssistantProposedAction } from './ai-assistant-types';
import type { AgentFlowStateSnapshot } from './types';
import { normalizeString } from '../../../common/helpers/normalize-string.helper';

export interface CreateSourceKeyValidationError {
  code: 'create_source_key_not_unique';
  message: string;
  actionId: string;
  suggestedSourceKey: string;
  conflictType: 'existing_source' | 'proposed_action';
  conflictingActionId?: string;
  existingSourceKeys: string[];
}

export class AgentFlowCreateSourceKeyInvalidError extends Error {
  constructor(
    public readonly validationError: CreateSourceKeyValidationError,
    public readonly retryAttempts: number
  ) {
    super(
      `create_source_key_invalid_after_${retryAttempts}_retries:` +
        `${validationError.code}:${validationError.suggestedSourceKey}`
    );
  }
}

export type CreateSourceKeyValidationResult =
  | { ok: true }
  | {
      ok: false;
      error: CreateSourceKeyValidationError;
    };

@Injectable()
export class AgentFlowCreateSourceKeyValidatorService {
  validate(params: {
    proposedActions: AssistantProposedAction[] | undefined;
    stateSnapshot: AgentFlowStateSnapshot;
  }): CreateSourceKeyValidationResult {
    const proposedActions = params.proposedActions ?? [];
    const existingSourceKeys = params.stateSnapshot.sources
      .map(source => normalizeString(source.sourceKey))
      .filter((key): key is string => Boolean(key));
    const existingKeySet = new Set(existingSourceKeys);
    const proposedCreateKeys = new Map<string, string>();

    for (const action of proposedActions) {
      if (action.type !== 'create_source_and_attach') {
        continue;
      }

      const suggestedSourceKey = normalizeString(action.payload.suggestedSourceKey);
      if (!suggestedSourceKey) {
        continue;
      }

      if (existingKeySet.has(suggestedSourceKey)) {
        return {
          ok: false,
          error: {
            code: 'create_source_key_not_unique',
            message: `suggestedSourceKey "${suggestedSourceKey}" already exists in template sources`,
            actionId: action.id,
            suggestedSourceKey,
            conflictType: 'existing_source',
            existingSourceKeys,
          },
        };
      }

      const conflictingActionId = proposedCreateKeys.get(suggestedSourceKey);
      if (conflictingActionId) {
        return {
          ok: false,
          error: {
            code: 'create_source_key_not_unique',
            message:
              `suggestedSourceKey "${suggestedSourceKey}" is duplicated across ` +
              `create_source_and_attach actions`,
            actionId: action.id,
            suggestedSourceKey,
            conflictType: 'proposed_action',
            conflictingActionId,
            existingSourceKeys,
          },
        };
      }

      proposedCreateKeys.set(suggestedSourceKey, action.id);
    }

    return { ok: true };
  }

  buildRetrySystemFeedback(params: {
    proposedActions: AssistantProposedAction[] | undefined;
    error: CreateSourceKeyValidationError;
  }): string {
    const { proposedActions, error } = params;
    const conflictDetails =
      error.conflictType === 'proposed_action' && error.conflictingActionId
        ? `It conflicts with another create action "${error.conflictingActionId}".`
        : 'It conflicts with an existing template source key.';

    return (
      'Your previous response had invalid `proposedActions` and cannot be applied.\n' +
      `Validation error: [${error.code}] ${error.message}. ${conflictDetails}\n` +
      'How to fix: For `create_source_and_attach`, set `payload.suggestedSourceKey` to a UNIQUE key ' +
      'that is not used by current template sources (for example, add suffix `_2`, `_3`).\n' +
      'Return the full JSON response again (same schema), with corrected `proposedActions`.\n' +
      'Do not change unrelated fields unless needed for consistency.\n' +
      `Current template source keys: ${JSON.stringify(error.existingSourceKeys)}\n` +
      `Previous invalid proposedActions: ${JSON.stringify(proposedActions ?? [])}`
    );
  }
}
