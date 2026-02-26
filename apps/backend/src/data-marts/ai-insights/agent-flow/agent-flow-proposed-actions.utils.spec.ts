import { resolveAgentFlowProposedActions } from './agent-flow-proposed-actions.utils';

describe('resolveAgentFlowProposedActions', () => {
  it('prefers actions from final model result over context actions', () => {
    const resolved = resolveAgentFlowProposedActions({
      resultProposedActions: [
        {
          type: 'apply_sql_to_artifact',
          id: 'act_result',
          confidence: 0.9,
          payload: {
            artifactId: 'artifact-result',
          },
        },
      ],
      contextProposedActions: [
        {
          type: 'apply_sql_to_artifact',
          id: 'act_context',
          confidence: 0.8,
          payload: {
            artifactId: 'artifact-context',
          },
        },
      ],
    });

    expect(resolved).toHaveLength(1);
    expect(resolved[0].id).toBe('act_result');
  });

  it('falls back to context actions when model result has none', () => {
    const resolved = resolveAgentFlowProposedActions({
      resultProposedActions: [],
      contextProposedActions: [
        {
          type: 'apply_sql_to_artifact',
          id: 'act_context',
          confidence: 0.8,
          payload: {
            artifactId: 'artifact-context',
          },
        },
      ],
    });

    expect(resolved).toHaveLength(1);
    expect(resolved[0].id).toBe('act_context');
  });

  it('keeps template-scoped actions without injecting templateId', () => {
    const resolved = resolveAgentFlowProposedActions({
      resultProposedActions: [
        {
          type: 'create_source_and_attach',
          id: 'act_create',
          confidence: 0.85,
          payload: {
            suggestedSourceKey: 'consumption_2025',
          },
        },
      ],
    });

    expect(resolved).toHaveLength(1);
    expect(resolved[0].type).toBe('create_source_and_attach');
    if (resolved[0].type === 'create_source_and_attach') {
      expect('templateId' in resolved[0].payload).toBe(false);
    }
  });

  it('synthesizes replace_template_document action from templateEditIntent', () => {
    const resolved = resolveAgentFlowProposedActions({
      templateEditIntent: {
        type: 'replace_template_document',
        text: '# Report\n\n[[TAG:t1]]',
        tags: [{ id: 't1', name: 'table', params: { source: 'main' } }],
      },
    });

    expect(resolved).toHaveLength(1);
    expect(resolved[0].type).toBe('replace_template_document');
    if (resolved[0].type === 'replace_template_document') {
      expect(resolved[0].payload.text).toBe('# Report\n\n[[TAG:t1]]');
      expect(resolved[0].payload.tags).toEqual([
        { id: 't1', name: 'table', params: { source: 'main' } },
      ]);
      expect(resolved[0].payload.suggestedTemplateEditDiffPreview).toBeUndefined();
    }
    expect(resolved[0].id).toMatch(/^act_/);
  });

  it('merges templateEditIntent into source action when source action is present', () => {
    const resolved = resolveAgentFlowProposedActions({
      resultProposedActions: [
        {
          type: 'create_source_and_attach',
          id: 'act_create',
          confidence: 0.92,
          payload: {
            suggestedSourceKey: 'consumption_2025',
          },
        },
      ],
      templateEditIntent: {
        type: 'replace_template_document',
        text: '# Report\n\n[[TAG:t1]]',
        tags: [{ id: 't1', name: 'table', params: { source: 'consumption_2025' } }],
      },
    });

    expect(resolved).toHaveLength(1);
    expect(resolved[0].type).toBe('create_source_and_attach');
    if (resolved[0].type === 'create_source_and_attach') {
      expect(resolved[0].payload.text).toBe('# Report\n\n[[TAG:t1]]');
      expect(resolved[0].payload.tags).toEqual([
        { id: 't1', name: 'table', params: { source: 'consumption_2025' } },
      ]);
      expect(resolved[0].payload.suggestedTemplateEditDiffPreview).toBeUndefined();
    }
  });
});
