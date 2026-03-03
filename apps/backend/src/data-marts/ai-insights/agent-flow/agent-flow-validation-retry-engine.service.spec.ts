import { AgentFlowValidationRetryEngineService } from './agent-flow-validation-retry-engine.service';
import {
  AgentFlowValidationContext,
  AgentFlowValidationRetryRule,
  createAgentFlowValidationRetryState,
} from './agent-flow-validation-retry.types';

describe('AgentFlowValidationRetryEngineService', () => {
  const createContext = (): AgentFlowValidationContext => ({
    result: {
      decision: 'explain',
      explanation: 'ok',
      reasonDescription: 'ok',
    },
    resolvedProposedActions: [],
    stateSnapshot: {
      sessionId: 'session-1',
      templateId: 'template-1',
      sources: [],
      appliedActions: [],
      pendingActions: [],
      sqlRevisions: [],
    },
  });

  const createPassingRule = (): AgentFlowValidationRetryRule => ({
    key: 'pass_rule',
    maxRetries: 2,
    retryLogMessage: 'pass',
    validate: () => ({ ok: true }),
    buildRetryHint: () => 'hint',
    toTerminalError: () => new Error('terminal'),
  });

  it('returns pass when all rules pass', () => {
    const engine = new AgentFlowValidationRetryEngineService();
    const state = createAgentFlowValidationRetryState();
    const result = engine.evaluate({
      rules: [createPassingRule()],
      context: createContext(),
      state,
    });

    expect(result).toEqual({ type: 'pass' });
    expect(state.retryCountByRuleKey).toEqual({});
  });

  it('returns retry and increments retry counter when rule fails below limit', () => {
    const engine = new AgentFlowValidationRetryEngineService();
    const state = createAgentFlowValidationRetryState();
    const result = engine.evaluate({
      rules: [
        {
          key: 'rule_1',
          maxRetries: 2,
          retryLogMessage: 'retry',
          validate: () => ({ ok: false, error: { code: 'invalid' } }),
          buildRetryHint: () => 'fix it',
          toTerminalError: () => new Error('terminal'),
          buildRetryLogMeta: error => ({ code: (error as { code: string }).code }),
        },
      ],
      context: createContext(),
      state,
    });

    expect(result).toEqual({
      type: 'retry',
      ruleKey: 'rule_1',
      retry: 1,
      feedback: 'fix it',
      logMessage: 'retry',
      logMeta: { code: 'invalid' },
    });
    expect(state.retryCountByRuleKey).toEqual({ rule_1: 1 });
  });

  it('throws terminal error when retries are exhausted', () => {
    const engine = new AgentFlowValidationRetryEngineService();
    const state = createAgentFlowValidationRetryState();
    state.retryCountByRuleKey.rule_1 = 2;
    const rules: AgentFlowValidationRetryRule[] = [
      {
        key: 'rule_1',
        maxRetries: 2,
        retryLogMessage: 'retry',
        validate: () => ({ ok: false, error: { code: 'invalid' } }),
        buildRetryHint: () => 'fix it',
        toTerminalError: () => new Error('terminal_error'),
      },
    ];

    expect(() =>
      engine.evaluate({
        rules,
        context: createContext(),
        state,
      })
    ).toThrow('terminal_error');
    expect(state.retryCountByRuleKey.rule_1).toBe(2);
  });

  it('skips rule when applies() returns false', () => {
    const engine = new AgentFlowValidationRetryEngineService();
    const state = createAgentFlowValidationRetryState();

    const result = engine.evaluate({
      rules: [
        {
          key: 'skipped',
          maxRetries: 2,
          retryLogMessage: 'retry',
          applies: () => false,
          validate: () => ({ ok: false, error: { code: 'should_not_run' } }),
          buildRetryHint: () => 'fix it',
          toTerminalError: () => new Error('terminal'),
        },
        createPassingRule(),
      ],
      context: createContext(),
      state,
    });

    expect(result).toEqual({ type: 'pass' });
    expect(state.retryCountByRuleKey).toEqual({});
  });
});
