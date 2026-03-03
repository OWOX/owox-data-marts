import { AgentFlowCreateSourceKeyValidatorService } from './agent-flow-create-source-key-validator.service';

describe('AgentFlowCreateSourceKeyValidatorService', () => {
  const createStateSnapshot = (sourceKeys: string[]) => ({
    sessionId: 'session-1',
    templateId: 'template-1',
    sources: sourceKeys.map(sourceKey => ({
      sourceKey,
      artifactId: null,
      artifactTitle: null,
      isAttachedToTemplate: true,
      sqlHash: null,
      sqlPreview: null,
      updatedAt: null,
    })),
    appliedActions: [],
    pendingActions: [],
    sqlRevisions: [],
  });

  it('returns ok for non-create actions', () => {
    const service = new AgentFlowCreateSourceKeyValidatorService();

    const result = service.validate({
      proposedActions: [
        {
          type: 'apply_sql_to_artifact',
          id: 'act_1',
          confidence: 0.9,
          payload: { artifactId: 'artifact-1' },
        },
      ],
      stateSnapshot: createStateSnapshot(['monthly_consumption']),
    });

    expect(result).toEqual({ ok: true });
  });

  it('returns error when create action key collides with existing template source', () => {
    const service = new AgentFlowCreateSourceKeyValidatorService();

    const result = service.validate({
      proposedActions: [
        {
          type: 'create_source_and_attach',
          id: 'act_create',
          confidence: 0.95,
          payload: { suggestedSourceKey: 'monthly_consumption' },
        },
      ],
      stateSnapshot: createStateSnapshot(['monthly_consumption']),
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'create_source_key_not_unique',
        message: 'suggestedSourceKey "monthly_consumption" already exists in template sources',
        actionId: 'act_create',
        suggestedSourceKey: 'monthly_consumption',
        conflictType: 'existing_source',
        existingSourceKeys: ['monthly_consumption'],
      },
    });
  });

  it('builds actionable feedback for retry', () => {
    const service = new AgentFlowCreateSourceKeyValidatorService();

    const feedback = service.buildRetrySystemFeedback({
      proposedActions: [
        {
          type: 'create_source_and_attach',
          id: 'act_create',
          confidence: 0.95,
          payload: { suggestedSourceKey: 'monthly_consumption' },
        },
      ],
      error: {
        code: 'create_source_key_not_unique',
        message: 'suggestedSourceKey "monthly_consumption" already exists in template sources',
        actionId: 'act_create',
        suggestedSourceKey: 'monthly_consumption',
        conflictType: 'existing_source',
        existingSourceKeys: ['monthly_consumption'],
      },
    });

    expect(feedback).toContain('invalid `proposedActions`');
    expect(feedback).toContain('[create_source_key_not_unique]');
    expect(feedback).toContain('UNIQUE key');
    expect(feedback).toContain('Previous invalid proposedActions');
  });
});
