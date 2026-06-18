import { Injectable, Logger } from '@nestjs/common';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { McpSdkServerFactory } from './mcp-sdk-server.factory';

@Injectable()
export class McpStreamableHttpTransportHandler {
  private readonly logger = new Logger(McpStreamableHttpTransportHandler.name);

  constructor(private readonly serverFactory: McpSdkServerFactory) {}

  async handleRequest(
    request: Request,
    response: Response,
    body: unknown,
    context: McpAuthContext
  ): Promise<void> {
    const requestedSessionId = this.getRequestedSessionId(request);
    const isInitialization = this.isInitializationRequest(body);

    this.logger.debug('MCP request routing', {
      method: request.method,
      url: request.originalUrl ?? request.url,
      requestSessionId: requestedSessionId,
      hasSessionId: Boolean(requestedSessionId),
      isInitialization,
      accept: request.headers.accept,
      contentType: request.headers['content-type'],
      rpc: this.getJsonRpcSummary(body),
      projectId: context.projectId,
      clientId: context.clientId,
    });

    if (request.method === 'GET') {
      this.rejectStandaloneSseStream(request, response, body, context);
      return;
    }

    this.logger.debug('MCP creating SDK transport', {
      method: request.method,
      mode: 'stateless-json',
      requestSessionId: requestedSessionId,
      rpc: this.getJsonRpcSummary(body),
      projectId: context.projectId,
      clientId: context.clientId,
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    transport.onerror = error => {
      this.logger.warn('MCP SDK transport error', {
        message: error instanceof Error ? error.message : String(error),
        method: request.method,
        hasSessionId: Boolean(requestedSessionId),
        requestSessionId: requestedSessionId,
        mode: 'stateless-json',
        accept: request.headers.accept,
        contentType: request.headers['content-type'],
        rpc: this.getJsonRpcSummary(body),
        projectId: context.projectId,
        clientId: context.clientId,
      });
    };

    const server = this.serverFactory.create(context);
    await server.connect(transport);

    await transport.handleRequest(request as never, response as never, body);
  }

  private rejectStandaloneSseStream(
    request: Request,
    response: Response,
    body: unknown,
    context: McpAuthContext
  ): void {
    this.logger.debug('MCP standalone SSE stream not supported', {
      method: request.method,
      requestSessionId: this.getRequestedSessionId(request),
      accept: request.headers.accept,
      contentType: request.headers['content-type'],
      rpc: this.getJsonRpcSummary(body),
      projectId: context.projectId,
      clientId: context.clientId,
    });

    response.setHeader('Allow', 'POST, DELETE');
    response.status(405).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Standalone MCP SSE stream is not supported',
      },
      id: null,
    });
  }

  private getRequestedSessionId(request: Request): string | undefined {
    const header = request.headers['mcp-session-id'];
    return Array.isArray(header) ? header[0] : header;
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

  private isInitializationRequest(body: unknown): boolean {
    if (Array.isArray(body)) {
      return body.some(item => this.isInitializationRequest(item));
    }

    return Boolean(
      body && typeof body === 'object' && (body as { method?: unknown }).method === 'initialize'
    );
  }
}
