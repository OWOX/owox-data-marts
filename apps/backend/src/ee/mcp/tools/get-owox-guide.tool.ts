import { Injectable } from '@nestjs/common';
import type { McpScope } from '@owox/idp-protocol';
import { z } from 'zod';
import { MCP_GUIDES, MCP_GUIDE_TOPICS, type McpGuideTopic } from '../instructions/mcp-guides';
import type { McpToolDefinition, McpToolResult } from './mcp-tool.definition';

// ChatGPT keeps the tool list from the time the app was added, so add topics but never rename them.
const inputSchema = z
  .object({
    topic: z.enum(MCP_GUIDE_TOPICS).describe('The guide topic that a tool description names.'),
  })
  .strict();

type GetOwoxGuideInput = { topic: McpGuideTopic };

@Injectable()
export class GetOwoxGuideTool implements McpToolDefinition<GetOwoxGuideInput> {
  readonly name = 'get_owox_guide';
  readonly description = `Return the OWOX workflow guide for one topic: ${MCP_GUIDE_TOPICS.join(', ')}. Each guide gives the order of calls, the rules and the error handling for the tools of its task. Call it before a multi-step task, and when a tool description tells you to. The guide is static text: it does not read project data.`;
  readonly zodSchema = inputSchema.shape;
  readonly annotations = {
    title: 'Get OWOX Guide',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];

  parseInput(input: unknown): GetOwoxGuideInput {
    return inputSchema.parse(input);
  }

  async handler(input: GetOwoxGuideInput): Promise<McpToolResult> {
    const { topic } = this.parseInput(input);
    return { content: [{ type: 'text', text: MCP_GUIDES[topic] }] };
  }
}
