import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { ToolRegistry } from './agent/tool-registry';
import { AiAssistantMessage, AiChatProvider, AiRole, AiToolCall, AiUsage } from './agent/ai-core';
import { AgentTelemetry, ToolExecutionPolicy } from './agent/types';
import { runAgentLoop } from './llm-tool-runner';

const DEFAULT_USAGE: AiUsage = {
  executionTime: 0,
  promptTokens: 0,
  completionTokens: 0,
  reasoningTokens: 0,
  totalTokens: 0,
};

function createTelemetry(): AgentTelemetry {
  return {
    llmCalls: [],
    toolCalls: [],
    messageHistory: [],
  };
}

function createProvider(messages: AiAssistantMessage[]): AiChatProvider {
  let callIndex = 0;

  return {
    chat: jest.fn(async () => {
      const next = messages[callIndex];
      callIndex += 1;

      if (!next) {
        throw new Error(`No mocked assistant message for call #${callIndex}`);
      }

      return {
        message: next,
        usage: DEFAULT_USAGE,
      };
    }),
  };
}

function assistantMessage(params: {
  content?: string;
  toolCalls?: AiToolCall[];
}): AiAssistantMessage {
  return {
    role: AiRole.ASSISTANT,
    content: params.content,
    toolCalls: params.toolCalls,
  };
}

function createToolCall(name: string, id: string, args: unknown = {}): AiToolCall {
  return {
    id,
    name,
    argumentsJson: JSON.stringify(args),
  };
}

function registerTool(params: {
  registry: ToolRegistry;
  name: string;
  execute: (args: unknown) => Promise<unknown>;
}) {
  const { registry, name, execute } = params;
  registry.register({
    name,
    inputJsonSchema: {
      type: 'object',
      properties: {},
      additionalProperties: true,
    },
    inputZod: z.record(z.unknown()),
    execute: async args => execute(args),
    isFinal: false,
  });
}

function createRulesByToolName(names: string[]): ToolExecutionPolicy {
  return {
    rules: Object.fromEntries(names.map(name => [name, {}])),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForOrThrow(
  predicate: () => boolean,
  timeoutMs: number,
  message: string
): Promise<void> {
  const startedAt = Date.now();

  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(message);
    }
    await sleep(1);
  }
}

describe('runAgentLoop', () => {
  const logger = new Logger('runAgentLoopSpec');

  it('returns parsed JSON result when assistant returns final JSON without tools', async () => {
    const provider = createProvider([assistantMessage({ content: '{"ok":true}' })]);
    const registry = new ToolRegistry();

    const result = await runAgentLoop({
      aiProvider: provider,
      toolRegistry: registry,
      context: {},
      telemetry: createTelemetry(),
      initialMessages: [{ role: AiRole.SYSTEM, content: 'system' }],
      tools: [],
      maxTurns: 2,
      resultSchema: z.object({ ok: z.boolean() }),
      logger,
    });

    expect(result.result).toEqual({ ok: true });
  });

  it('uses local JSON extraction without extra LLM call', async () => {
    const provider = createProvider([
      assistantMessage({
        content: '```json\n{"status":"ok"}\n```',
      }),
    ]);

    const result = await runAgentLoop({
      aiProvider: provider,
      toolRegistry: new ToolRegistry(),
      context: {},
      telemetry: createTelemetry(),
      initialMessages: [{ role: AiRole.SYSTEM, content: 'system' }],
      tools: [],
      maxTurns: 2,
      resultSchema: z.object({ status: z.literal('ok') }),
      logger,
    });

    expect(result.result).toEqual({ status: 'ok' });
    expect((provider.chat as jest.Mock).mock.calls).toHaveLength(1);
  });

  it('requests JSON fix via second LLM call when extraction fails', async () => {
    const provider = createProvider([
      assistantMessage({ content: 'not a json' }),
      assistantMessage({ content: '{"status":"fixed"}' }),
    ]);

    const result = await runAgentLoop({
      aiProvider: provider,
      toolRegistry: new ToolRegistry(),
      context: {},
      telemetry: createTelemetry(),
      initialMessages: [{ role: AiRole.SYSTEM, content: 'system' }],
      tools: [],
      maxTurns: 2,
      resultSchema: z.object({ status: z.literal('fixed') }),
      logger,
    });

    expect(result.result).toEqual({ status: 'fixed' });
    expect((provider.chat as jest.Mock).mock.calls).toHaveLength(2);
  });

  it('throws when JSON is still invalid after fix attempt', async () => {
    const provider = createProvider([
      assistantMessage({ content: 'not a json' }),
      assistantMessage({ content: 'still not json' }),
    ]);

    await expect(
      runAgentLoop({
        aiProvider: provider,
        toolRegistry: new ToolRegistry(),
        context: {},
        telemetry: createTelemetry(),
        initialMessages: [{ role: AiRole.SYSTEM, content: 'system' }],
        tools: [],
        maxTurns: 2,
        resultSchema: z.object({ status: z.string() }),
        logger,
      })
    ).rejects.toThrow('not valid JSON');
  });

  it('falls back to legacy sequential execution when executionPolicy is missing', async () => {
    const registry = new ToolRegistry();
    const executionOrder: string[] = [];

    registerTool({
      registry,
      name: 'tool_a',
      execute: async () => {
        executionOrder.push('A');
        return { ok: true };
      },
    });
    registerTool({
      registry,
      name: 'tool_b',
      execute: async () => {
        executionOrder.push('B');
        return { ok: true };
      },
    });

    const tools = registry.findToolByNames(['tool_a', 'tool_b']);
    const provider = createProvider([
      assistantMessage({
        toolCalls: [createToolCall('tool_a', '1'), createToolCall('tool_b', '2')],
      }),
      assistantMessage({ content: '{"done":true}' }),
    ]);

    await runAgentLoop({
      aiProvider: provider,
      toolRegistry: registry,
      context: {},
      telemetry: createTelemetry(),
      initialMessages: [{ role: AiRole.SYSTEM, content: 'system' }],
      tools,
      maxTurns: 3,
      resultSchema: z.object({ done: z.boolean() }),
      logger,
    });

    expect(executionOrder).toEqual(['A', 'B']);
  });

  it('falls back to legacy sequential execution when executionPolicy.rules is empty', async () => {
    const registry = new ToolRegistry();
    const executionOrder: string[] = [];

    registerTool({
      registry,
      name: 'tool_a',
      execute: async () => {
        executionOrder.push('A');
        return { ok: true };
      },
    });
    registerTool({
      registry,
      name: 'tool_b',
      execute: async () => {
        executionOrder.push('B');
        return { ok: true };
      },
    });

    const tools = registry.findToolByNames(['tool_a', 'tool_b']);
    const provider = createProvider([
      assistantMessage({
        toolCalls: [createToolCall('tool_a', '1'), createToolCall('tool_b', '2')],
      }),
      assistantMessage({ content: '{"done":true}' }),
    ]);

    await runAgentLoop({
      aiProvider: provider,
      toolRegistry: registry,
      context: {},
      telemetry: createTelemetry(),
      initialMessages: [{ role: AiRole.SYSTEM, content: 'system' }],
      tools,
      maxTurns: 3,
      resultSchema: z.object({ done: z.boolean() }),
      logger,
      executionPolicy: { rules: {} },
    });

    expect(executionOrder).toEqual(['A', 'B']);
  });

  it('validates executionPolicy and fails when tool rules are missing', async () => {
    const registry = new ToolRegistry();
    registerTool({ registry, name: 'tool_a', execute: async () => ({}) });
    registerTool({ registry, name: 'tool_b', execute: async () => ({}) });

    const tools = registry.findToolByNames(['tool_a', 'tool_b']);
    const provider = createProvider([assistantMessage({ content: '{"done":true}' })]);

    await expect(
      runAgentLoop({
        aiProvider: provider,
        toolRegistry: registry,
        context: {},
        telemetry: createTelemetry(),
        initialMessages: [{ role: AiRole.SYSTEM, content: 'system' }],
        tools,
        maxTurns: 1,
        resultSchema: z.object({ done: z.boolean() }),
        logger,
        executionPolicy: {
          rules: {
            tool_a: {},
          },
        },
      })
    ).rejects.toThrow('missing rules for tools: tool_b');
  });

  it('validates executionPolicy and fails for unknown dependency or cycle', async () => {
    const registry = new ToolRegistry();
    registerTool({ registry, name: 'tool_a', execute: async () => ({}) });
    registerTool({ registry, name: 'tool_b', execute: async () => ({}) });

    const tools = registry.findToolByNames(['tool_a', 'tool_b']);
    const provider = createProvider([assistantMessage({ content: '{"done":true}' })]);

    await expect(
      runAgentLoop({
        aiProvider: provider,
        toolRegistry: registry,
        context: {},
        telemetry: createTelemetry(),
        initialMessages: [{ role: AiRole.SYSTEM, content: 'system' }],
        tools,
        maxTurns: 1,
        resultSchema: z.object({ done: z.boolean() }),
        logger,
        executionPolicy: {
          rules: {
            tool_a: { dependsOn: ['tool_unknown'] },
            tool_b: {},
          },
        },
      })
    ).rejects.toThrow('depends on unknown tool');

    await expect(
      runAgentLoop({
        aiProvider: provider,
        toolRegistry: registry,
        context: {},
        telemetry: createTelemetry(),
        initialMessages: [{ role: AiRole.SYSTEM, content: 'system' }],
        tools,
        maxTurns: 1,
        resultSchema: z.object({ done: z.boolean() }),
        logger,
        executionPolicy: {
          rules: {
            tool_a: { dependsOn: ['tool_b'] },
            tool_b: { dependsOn: ['tool_a'] },
          },
        },
      })
    ).rejects.toThrow('contains dependency cycle');
  });

  it('runs independent tools in parallel batches with executionPolicy', async () => {
    const registry = new ToolRegistry();
    const events: string[] = [];
    const loggerMock = {
      log: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as Logger;

    registerTool({
      registry,
      name: 'tool_a',
      execute: async () => {
        events.push('A_start');
        await waitForOrThrow(
          () => events.includes('B_start'),
          100,
          'B did not start while A was running'
        );
        events.push('A_end');
        return { a: true };
      },
    });
    registerTool({
      registry,
      name: 'tool_b',
      execute: async () => {
        events.push('B_start');
        await sleep(10);
        events.push('B_end');
        return { b: true };
      },
    });

    const tools = registry.findToolByNames(['tool_a', 'tool_b']);
    const telemetry = createTelemetry();
    const provider = createProvider([
      assistantMessage({
        toolCalls: [createToolCall('tool_a', '1'), createToolCall('tool_b', '2')],
      }),
      assistantMessage({ content: '{"done":true}' }),
    ]);

    await runAgentLoop({
      aiProvider: provider,
      toolRegistry: registry,
      context: {},
      telemetry,
      initialMessages: [{ role: AiRole.SYSTEM, content: 'system' }],
      tools,
      maxTurns: 3,
      resultSchema: z.object({ done: z.boolean() }),
      logger: loggerMock,
      executionPolicy: createRulesByToolName(['tool_a', 'tool_b']),
    });

    expect(events).toContain('A_start');
    expect(events).toContain('B_start');
    expect(telemetry.toolCalls.every(call => call.success)).toBe(true);
    expect((loggerMock.log as jest.Mock).mock.calls).toEqual(
      expect.arrayContaining([[expect.stringContaining('Executing tools in parallel:')]])
    );
  });

  it('respects dependsOn and runAlone rules', async () => {
    const registry = new ToolRegistry();
    const started: string[] = [];

    registerTool({
      registry,
      name: 'tool_a',
      execute: async () => {
        started.push('A');
        return {};
      },
    });
    registerTool({
      registry,
      name: 'tool_b',
      execute: async () => {
        started.push('B');
        return {};
      },
    });
    registerTool({
      registry,
      name: 'tool_c',
      execute: async () => {
        started.push('C');
        return {};
      },
    });

    const tools = registry.findToolByNames(['tool_a', 'tool_b', 'tool_c']);
    const provider = createProvider([
      assistantMessage({
        toolCalls: [
          createToolCall('tool_a', '1'),
          createToolCall('tool_b', '2'),
          createToolCall('tool_c', '3'),
        ],
      }),
      assistantMessage({ content: '{"done":true}' }),
    ]);

    await runAgentLoop({
      aiProvider: provider,
      toolRegistry: registry,
      context: {},
      telemetry: createTelemetry(),
      initialMessages: [{ role: AiRole.SYSTEM, content: 'system' }],
      tools,
      maxTurns: 3,
      resultSchema: z.object({ done: z.boolean() }),
      logger,
      executionPolicy: {
        rules: {
          tool_a: {},
          tool_b: { runAlone: true },
          tool_c: { dependsOn: ['tool_a'] },
        },
      },
    });

    expect(started[0]).toBe('B');
    expect(started.indexOf('A')).toBeGreaterThan(0);
    expect(started.indexOf('C')).toBeGreaterThan(started.indexOf('A'));
  });

  it('waits for all calls of dependency tool name before dependent call starts', async () => {
    const registry = new ToolRegistry();
    let completedA = 0;
    const observedCompletedAByB: number[] = [];

    registerTool({
      registry,
      name: 'tool_a',
      execute: async args => {
        const delay = Number((args as { delay?: number }).delay ?? 0);
        await sleep(delay);
        completedA += 1;
        return {};
      },
    });

    registerTool({
      registry,
      name: 'tool_b',
      execute: async () => {
        observedCompletedAByB.push(completedA);
        return {};
      },
    });

    const tools = registry.findToolByNames(['tool_a', 'tool_b']);
    const provider = createProvider([
      assistantMessage({
        toolCalls: [
          createToolCall('tool_a', '1', { delay: 15 }),
          createToolCall('tool_a', '2', { delay: 1 }),
          createToolCall('tool_b', '3'),
        ],
      }),
      assistantMessage({ content: '{"done":true}' }),
    ]);

    await runAgentLoop({
      aiProvider: provider,
      toolRegistry: registry,
      context: {},
      telemetry: createTelemetry(),
      initialMessages: [{ role: AiRole.SYSTEM, content: 'system' }],
      tools,
      maxTurns: 3,
      resultSchema: z.object({ done: z.boolean() }),
      logger,
      executionPolicy: {
        rules: {
          tool_a: {},
          tool_b: { dependsOn: ['tool_a'] },
        },
      },
    });

    expect(observedCompletedAByB).toEqual([2]);
  });

  it('handles mixed success/failure in same parallel batch and continues loop', async () => {
    const registry = new ToolRegistry();
    registerTool({
      registry,
      name: 'tool_ok',
      execute: async () => ({ ok: true }),
    });
    registerTool({
      registry,
      name: 'tool_fail',
      execute: async () => {
        throw new Error('boom');
      },
    });

    const tools = registry.findToolByNames(['tool_ok', 'tool_fail']);
    const telemetry = createTelemetry();
    const provider = createProvider([
      assistantMessage({
        toolCalls: [createToolCall('tool_ok', '1'), createToolCall('tool_fail', '2')],
      }),
      assistantMessage({ content: '{"done":true}' }),
    ]);

    const output = await runAgentLoop({
      aiProvider: provider,
      toolRegistry: registry,
      context: {},
      telemetry,
      initialMessages: [{ role: AiRole.SYSTEM, content: 'system' }],
      tools,
      maxTurns: 3,
      resultSchema: z.object({ done: z.boolean() }),
      logger,
      executionPolicy: createRulesByToolName(['tool_ok', 'tool_fail']),
    });

    expect(output.result).toEqual({ done: true });
    expect(telemetry.toolCalls).toHaveLength(2);
    expect(telemetry.toolCalls.some(call => call.success)).toBe(true);
    expect(telemetry.toolCalls.some(call => !call.success)).toBe(true);
    expect(
      output.messages.some(msg => msg.role === AiRole.TOOL && msg.toolName === 'tool_fail')
    ).toBe(true);
  });

  it('applies custom messageProcessor to tool output', async () => {
    const registry = new ToolRegistry();
    registerTool({
      registry,
      name: 'tool_a',
      execute: async () => ({ value: 42 }),
    });

    const tools = registry.findToolByNames(['tool_a']);
    const provider = createProvider([
      assistantMessage({ toolCalls: [createToolCall('tool_a', '1')] }),
      assistantMessage({ content: '{"done":true}' }),
    ]);

    const output = await runAgentLoop({
      aiProvider: provider,
      toolRegistry: registry,
      context: {},
      telemetry: createTelemetry(),
      initialMessages: [{ role: AiRole.SYSTEM, content: 'system' }],
      tools,
      maxTurns: 3,
      resultSchema: z.object({ done: z.boolean() }),
      logger,
      executionPolicy: createRulesByToolName(['tool_a']),
      messageProcessors: {
        tool_a: () => 'processed-content',
      },
    });

    const toolMessages = output.messages.filter(msg => msg.role === AiRole.TOOL);
    expect(toolMessages).toHaveLength(1);
    expect(toolMessages[0].content).toBe('processed-content');
  });

  it('throws when tool loop does not finish within maxTurns', async () => {
    const registry = new ToolRegistry();
    registerTool({
      registry,
      name: 'tool_a',
      execute: async () => ({ ok: true }),
    });

    const tools = registry.findToolByNames(['tool_a']);
    const provider = createProvider([
      assistantMessage({ toolCalls: [createToolCall('tool_a', '1')] }),
      assistantMessage({ toolCalls: [createToolCall('tool_a', '2')] }),
    ]);

    await expect(
      runAgentLoop({
        aiProvider: provider,
        toolRegistry: registry,
        context: {},
        telemetry: createTelemetry(),
        initialMessages: [{ role: AiRole.SYSTEM, content: 'system' }],
        tools,
        maxTurns: 2,
        resultSchema: z.object({ done: z.boolean() }),
        logger,
        executionPolicy: createRulesByToolName(['tool_a']),
      })
    ).rejects.toThrow('Tool loop did not complete within turn limit');
  });
});
