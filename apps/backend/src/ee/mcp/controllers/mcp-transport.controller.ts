import { All, Body, Controller, Logger, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { McpAuthenticatedRequest } from '../auth/mcp-auth-context';
import { McpAuthExceptionFilter } from '../auth/mcp-auth.exception-filter';
import { McpAuthGuard } from '../auth/mcp-auth.guard';
import { McpStreamableHttpSessionRegistry } from '../sdk/mcp-streamable-http-session.registry';

@Controller()
@UseGuards(McpAuthGuard)
@UseFilters(McpAuthExceptionFilter)
export class McpTransportController {
  private readonly logger = new Logger(McpTransportController.name);

  constructor(private readonly sessions: McpStreamableHttpSessionRegistry) {}

  @All('/mcp')
  async handleMcp(
    @Req() request: McpAuthenticatedRequest,
    @Res() response: Response,
    @Body() body: unknown
  ): Promise<void> {
    const startedAt = Date.now();
    const requestSessionId = this.getRequestedSessionId(request);
    const rpc = this.getJsonRpcSummary(body);

    this.logger.debug('MCP request received', {
      method: request.method,
      url: request.originalUrl ?? request.url,
      requestSessionId,
      accept: request.headers?.accept,
      contentType: request.headers?.['content-type'],
      rpc,
      projectId: request.mcpContext.projectId,
      clientId: request.mcpContext.clientId,
    });

    if (typeof response.once === 'function') {
      response.once('finish', () => {
        const metadata = {
          statusCode: response.statusCode,
          durationMs: Date.now() - startedAt,
          contentType: response.getHeader('content-type'),
          requestSessionId,
          responseSessionId: response.getHeader('mcp-session-id'),
          rpc,
          projectId: request.mcpContext.projectId,
          clientId: request.mcpContext.clientId,
        };

        if (
          response.statusCode >= 400 &&
          !this.isExpectedStandaloneSseRejection(request, response)
        ) {
          this.logger.warn('MCP response finished with error status', metadata);
          return;
        }

        this.logger.debug('MCP response finished', metadata);
      });
    }

    await this.sessions.handleRequest(request, response, body, request.mcpContext);
  }

  private getRequestedSessionId(request: McpAuthenticatedRequest): string | undefined {
    const header = request.headers?.['mcp-session-id'];
    return Array.isArray(header) ? header[0] : header;
  }

  private isExpectedStandaloneSseRejection(
    request: McpAuthenticatedRequest,
    response: Response
  ): boolean {
    return request.method === 'GET' && response.statusCode === 405;
  }

  private getJsonRpcSummary(body: unknown): unknown {
    if (Array.isArray(body)) {
      return body.map(item => this.getJsonRpcSummary(item));
    }

    if (!body || typeof body !== 'object') {
      return typeof body;
    }

    const message = body as { id?: unknown; method?: unknown };
    return {
      id: this.toLoggableJsonRpcId(message.id),
      method: typeof message.method === 'string' ? message.method : undefined,
    };
  }

  private toLoggableJsonRpcId(id: unknown): string | number | null | undefined {
    if (typeof id === 'string' || typeof id === 'number' || id === null || id === undefined) {
      return id;
    }

    return '<non-scalar>';
  }
}
