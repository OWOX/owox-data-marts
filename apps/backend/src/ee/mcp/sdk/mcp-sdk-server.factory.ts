import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { McpScope } from '@owox/idp-protocol';
import type { ZodRawShape } from 'zod';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { McpConfigService } from '../config/mcp.config';
import type { McpToolResult } from '../tools/mcp-tool.definition';
import { McpToolRegistry } from '../tools/mcp-tool.registry';

type McpSdkToolRegistrar = {
  registerTool(
    name: string,
    config: {
      description: string;
      inputSchema: ZodRawShape;
      outputSchema?: ZodRawShape;
      annotations?: ToolAnnotations;
    },
    callback: (input: unknown, extra: { signal?: AbortSignal }) => Promise<McpToolResult>
  ): unknown;
};

@Injectable()
export class McpSdkServerFactory {
  constructor(
    private readonly config: McpConfigService,
    private readonly toolRegistry: McpToolRegistry
  ) {}

  create(mcpContext: McpAuthContext, instructions?: string): McpServer {
    const serverInfo = {
      name: this.config.serverName,
      version: this.config.serverVersion,
    };
    const server = instructions
      ? new McpServer(serverInfo, { instructions })
      : new McpServer(serverInfo);

    const sdkToolRegistrar = server as unknown as McpSdkToolRegistrar;

    for (const tool of this.toolRegistry.getTools()) {
      sdkToolRegistrar.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: tool.zodSchema,
          ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
          ...(tool.annotations ? { annotations: tool.annotations } : {}),
        },
        async (input, extra) => {
          this.assertScopes(mcpContext, tool.requiredScopes);
          // extra.signal fires on client disconnect/cancel — thread it so an abandoned query stops
          // waiting and is recorded CANCELLED (not billed) instead of running to completion.
          return tool.handler(input, mcpContext, extra?.signal);
        }
      );
    }

    return server;
  }

  private assertScopes(context: McpAuthContext, requiredScopes: McpScope[]): void {
    for (const scope of requiredScopes) {
      if (!context.scopes.includes(scope)) {
        throw new Error(`Missing MCP scope: ${scope}`);
      }
    }
  }
}
