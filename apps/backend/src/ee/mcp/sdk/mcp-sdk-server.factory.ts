import { Injectable, Logger } from '@nestjs/common';
import {
  McpServer,
  type ServerContext,
  type StandardSchemaWithJSON,
  type ToolAnnotations,
} from '@modelcontextprotocol/server';
import { castError } from '@owox/internal-helpers';
import type { McpScope } from '@owox/idp-protocol';
import type { ZodRawShape } from 'zod-v4';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { McpConfigService } from '../config/mcp.config';
import { McpCallInstrumentation } from '../observability/mcp-call-instrumentation';
import type { McpToolResult } from '../tools/mcp-tool.definition';
import { McpToolRegistry } from '../tools/mcp-tool.registry';
import { makeMcpOutputSchema } from './mcp-output-schema';
import { McpSchemaRefresh } from './mcp-schema-refresh';

type McpSdkToolRegistrar = {
  registerTool(
    name: string,
    config: {
      description: string;
      inputSchema: ZodRawShape;
      outputSchema?: StandardSchemaWithJSON;
      annotations?: ToolAnnotations;
    },
    callback: (input: unknown, ctx: ServerContext) => Promise<McpToolResult>
  ): unknown;
};

@Injectable()
export class McpSdkServerFactory {
  private readonly logger = new Logger(McpSdkServerFactory.name);
  private readonly schemaRefresh = new McpSchemaRefresh();
  private readonly outputSchemas = new WeakMap<ZodRawShape, StandardSchemaWithJSON>();

  constructor(
    private readonly config: McpConfigService,
    private readonly toolRegistry: McpToolRegistry,
    private readonly instrumentation: McpCallInstrumentation
  ) {}

  create(
    mcpContext: McpAuthContext,
    instructions?: string,
    refreshOptions?: { era: 'legacy' | 'modern'; notifyToolsChanged: () => void }
  ): McpServer {
    const serverInfo = {
      name: this.config.serverName,
      version: this.config.serverVersion,
    };
    const server = instructions
      ? new McpServer(serverInfo, { instructions })
      : new McpServer(serverInfo);

    const sdkToolRegistrar = server as unknown as McpSdkToolRegistrar;

    for (const tool of this.toolRegistry.getTools()) {
      const wrapped = this.instrumentation.wrap(tool.name, async (input, ctx) => {
        this.assertScopes(mcpContext, tool.requiredScopes);
        const notify =
          refreshOptions?.era === 'modern'
            ? refreshOptions.notifyToolsChanged
            : ctx?.mcpReq?.notify
              ? () => ctx.mcpReq.notify({ method: 'notifications/tools/list_changed' })
              : undefined;
        if (notify) {
          try {
            await this.schemaRefresh.notifyIfDue(
              mcpContext,
              notify,
              refreshOptions?.era === 'modern'
            );
          } catch (error) {
            // A failed cache-refresh hint must never turn an otherwise valid tool call into an error.
            this.logger.warn('MCP schema refresh notification failed', {
              toolName: tool.name,
              message: castError(error).message,
            });
          }
        }
        // ctx.mcpReq.signal fires on client disconnect/cancel — thread it so an abandoned query
        // stops waiting and is recorded CANCELLED (not billed) instead of running to completion.
        return tool.handler(input, mcpContext, ctx?.mcpReq?.signal);
      });

      sdkToolRegistrar.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: tool.zodSchema,
          ...(tool.outputSchema ? { outputSchema: this.outputSchema(tool.outputSchema) } : {}),
          ...(tool.annotations ? { annotations: tool.annotations } : {}),
        },
        wrapped
      );
    }

    return server;
  }

  private outputSchema(shape: ZodRawShape): StandardSchemaWithJSON {
    const cached = this.outputSchemas.get(shape);
    if (cached) return cached;
    const schema = makeMcpOutputSchema(shape);
    this.outputSchemas.set(shape, schema);
    return schema;
  }

  private assertScopes(context: McpAuthContext, requiredScopes: McpScope[]): void {
    for (const scope of requiredScopes) {
      if (!context.scopes.includes(scope)) {
        throw new Error(`Missing MCP scope: ${scope}`);
      }
    }
  }
}
