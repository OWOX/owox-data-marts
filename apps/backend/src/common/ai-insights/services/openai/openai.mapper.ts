import { AiMessage, AiRole, AiToolCall, AiUsage } from '../../agent/ai-core';
import { NormalizedToolCall, RawMessage, RawResponse, UsageInfo } from './types';

export function mapDomainMessageToOpenAi(m: AiMessage): Record<string, unknown> {
  if (m.role === AiRole.SYSTEM || m.role === AiRole.USER) {
    return { role: m.role, content: m.content };
  }
  if (m.role === AiRole.ASSISTANT) {
    return {
      role: AiRole.ASSISTANT,
      content: m.content,
      tool_calls: m.toolCalls?.map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: tc.argumentsJson },
      })),
    };
  }
  if (m.role === AiRole.TOOL) {
    return { role: AiRole.TOOL, tool_call_id: m.callId, content: m.content };
  }
  return { role: AiRole.SYSTEM, content: '' };
}

export function mapUsageToDomain(usage?: UsageInfo): AiUsage | undefined {
  if (!usage) return undefined;
  return {
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    reasoningTokens: usage.reasoningTokens,
    totalTokens: usage.totalTokens,
  };
}

export function normalizeToolCallsFromToolCalls(
  message: RawMessage
): NormalizedToolCall[] | undefined {
  if (!Array.isArray(message.tool_calls) || message.tool_calls.length === 0) {
    return undefined;
  }

  const normalized = message.tool_calls
    .map((tc): NormalizedToolCall | null => {
      const fnName = tc.function?.name ?? '';
      if (!fnName) return null;

      const id = tc.id ?? '';
      const rawArgs = tc.function?.arguments;
      const args = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs ?? {});

      return {
        id,
        type: 'function',
        function: { name: fnName, arguments: args },
      };
    })
    .filter((tc): tc is NormalizedToolCall => tc !== null);

  return normalized.length > 0 ? normalized : undefined;
}

export function normalizeToolCallsFromFunctionCall(
  message: RawMessage
): NormalizedToolCall[] | undefined {
  const fc = message.function_call;
  if (!fc || !fc.name) {
    return undefined;
  }

  const args = typeof fc.arguments === 'string' ? fc.arguments : JSON.stringify(fc.arguments ?? {});

  return [
    {
      id: '',
      type: 'function',
      function: { name: fc.name, arguments: args },
    },
  ];
}

export function normalizeToolCallsFromCommentary(
  content?: string
): NormalizedToolCall[] | undefined {
  if (!content) return undefined;

  const regex = /to=functions\.([\w.-]+)[\s\S]*?<\|message\|>(\{[\s\S]*?})<\|call\|>/m;

  const match = content.match(regex);
  if (!match) return undefined;

  const fnName = match[1];
  const args = match[2];

  return [
    {
      id: '',
      type: 'function',
      function: { name: fnName, arguments: args },
    },
  ];
}

export function normalizeToolCallsFromBracketSyntax(
  content?: string
): NormalizedToolCall[] | undefined {
  if (!content) return undefined;

  // Matches things like:
  // [schema_get_metadata()]
  // [schema_get_metadata({"foo": 1})]
  // [schema.get-metadata({"foo": "bar"})]
  const regex = /\[([a-zA-Z0-9_.-]+)\(([\s\S]*?)\)]/g;

  const calls: NormalizedToolCall[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const fnName = match[1]?.trim();
    if (!fnName) continue;

    const rawArgs = match[2]?.trim();
    const args = rawArgs && rawArgs.length > 0 ? rawArgs : '{}';

    calls.push({
      id: '',
      type: 'function',
      function: { name: fnName, arguments: args },
    });
  }

  return calls.length > 0 ? calls : undefined;
}

export function extractReasoning(data: RawResponse, message: RawMessage): string | undefined {
  return message.reasoning_content || message.reasoning || data.reasoning || data.output?.reasoning;
}

export function extractUsage(data: RawResponse): UsageInfo | undefined {
  const usage = data.usage;
  if (!usage) return undefined;

  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    reasoningTokens: usage.reasoning_tokens,
    totalTokens: usage.total_tokens,
  };
}

export function mapNormalizedToolCallsToAiToolCalls(
  list?: NormalizedToolCall[]
): AiToolCall[] | undefined {
  if (!list || list.length === 0) return undefined;
  return list.map(tc => ({
    id: tc.id,
    name: tc.function.name,
    argumentsJson: tc.function.arguments || '{}',
  }));
}
