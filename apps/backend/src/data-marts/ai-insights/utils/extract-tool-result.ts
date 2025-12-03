import { z } from 'zod';
import { ToolExecutionRecord } from '../../../common/ai-insights/agent/types';

export function extractToolResult<TSchema extends z.ZodTypeAny>(
  toolExecutions: ToolExecutionRecord[],
  toolName: string,
  schema: TSchema
): z.infer<TSchema> {
  const exec = toolExecutions.findLast(t => t.name === toolName);
  if (!exec) {
    throw new Error(`No execution found for tool: ${toolName}`);
  }

  return schema.parse(exec.result.content);
}
