import { randomUUID } from 'node:crypto';
import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { McpConfigService } from '../config/mcp.config';
import { McpSdkServerFactory } from './mcp-sdk-server.factory';

const MCP_SESSION_IDLE_TTL_MS = 30 * 60 * 1000;

interface McpSession {
  readonly contextKey: string;
  readonly transport: StreamableHTTPServerTransport;
  lastSeenAt: number;
}

@Injectable()
export class McpStreamableHttpSessionRegistry {
  private readonly logger = new Logger(McpStreamableHttpSessionRegistry.name);
  private readonly sessions = new Map<string, McpSession>();

  constructor(
    private readonly serverFactory: McpSdkServerFactory,
    private readonly mcpConfig: McpConfigService
  ) {}

  async handleRequest(
    request: Request,
    response: Response,
    body: unknown,
    context: McpAuthContext
  ): Promise<void> {
    const requestedSessionId = this.getRequestedSessionId(request);
    const contextKey = this.getContextKey(context);
    const isInitialization = this.isInitializationRequest(body);
    const stateless = this.mcpConfig.stateless;
    const now = Date.now();

    this.cleanupExpiredSessions(now);

    this.logger.debug('MCP session routing', {
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
      sessionsCount: this.sessions.size,
    });

    if (request.method === 'GET') {
      this.rejectStandaloneSseStream(request, response, body, context);
      return;
    }

    if (!stateless && requestedSessionId) {
      const session = this.sessions.get(requestedSessionId);
      if (!session) {
        if (!isInitialization) {
          this.logger.warn('MCP unknown session rejected', {
            method: request.method,
            requestSessionId: requestedSessionId,
            rpc: this.getJsonRpcSummary(body),
            projectId: context.projectId,
            clientId: context.clientId,
            sessionsCount: this.sessions.size,
          });
          throw new NotFoundException('Unknown MCP session');
        }
        this.logger.debug('MCP ignoring unknown session for initialize request', {
          method: request.method,
          requestSessionId: requestedSessionId,
          rpc: this.getJsonRpcSummary(body),
          projectId: context.projectId,
          clientId: context.clientId,
          sessionsCount: this.sessions.size,
        });
      } else if (session.contextKey !== contextKey) {
        this.logger.warn('MCP session context mismatch rejected', {
          method: request.method,
          requestSessionId: requestedSessionId,
          rpc: this.getJsonRpcSummary(body),
          projectId: context.projectId,
          clientId: context.clientId,
        });
        throw new UnauthorizedException('MCP session context mismatch');
      } else {
        session.lastSeenAt = now;
        this.logger.debug('MCP routed to existing session', {
          method: request.method,
          requestSessionId: requestedSessionId,
          rpc: this.getJsonRpcSummary(body),
          projectId: context.projectId,
          clientId: context.clientId,
          sessionsCount: this.sessions.size,
        });
        await session.transport.handleRequest(request as never, response as never, body);
        return;
      }
    }

    const isStatelessRequest = stateless || (!requestedSessionId && !isInitialization);
    const generatedSessionId = isStatelessRequest ? undefined : randomUUID();
    this.logger.debug('MCP creating SDK transport', {
      method: request.method,
      mode: isStatelessRequest ? 'stateless-json' : 'stateful-json',
      requestSessionId: requestedSessionId,
      generatedSessionId,
      rpc: this.getJsonRpcSummary(body),
      projectId: context.projectId,
      clientId: context.clientId,
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: generatedSessionId ? () => generatedSessionId : undefined,
      enableJsonResponse: true,
    });
    transport.onerror = error => {
      this.logger.warn('MCP SDK transport error', {
        message: error instanceof Error ? error.message : String(error),
        method: request.method,
        hasSessionId: Boolean(requestedSessionId),
        requestSessionId: requestedSessionId,
        generatedSessionId,
        mode: isStatelessRequest ? 'stateless-json' : 'stateful-json',
        accept: request.headers.accept,
        contentType: request.headers['content-type'],
        rpc: this.getJsonRpcSummary(body),
        projectId: context.projectId,
        clientId: context.clientId,
      });
    };
    transport.onclose = () => {
      const sessionId = transport.sessionId ?? generatedSessionId;
      if (sessionId) {
        this.sessions.delete(sessionId);
        this.logger.debug('MCP session closed', {
          sessionId,
          projectId: context.projectId,
          clientId: context.clientId,
          sessionsCount: this.sessions.size,
        });
      }
    };

    const server = this.serverFactory.create(context);
    await server.connect(transport);
    if (generatedSessionId) {
      const sessionId = transport.sessionId ?? generatedSessionId;
      this.sessions.set(sessionId, {
        contextKey,
        transport,
        lastSeenAt: now,
      });
      this.logger.debug('MCP session registered', {
        sessionId,
        projectId: context.projectId,
        clientId: context.clientId,
        sessionsCount: this.sessions.size,
      });
    }

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
      sessionsCount: this.sessions.size,
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

  private cleanupExpiredSessions(now: number): void {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastSeenAt <= MCP_SESSION_IDLE_TTL_MS) {
        continue;
      }

      this.sessions.delete(sessionId);
      this.logger.debug('MCP idle session expired', {
        sessionId,
        sessionsCount: this.sessions.size,
      });
    }
  }

  private getContextKey(context: McpAuthContext): string {
    return [
      context.clientId,
      context.userId,
      context.projectId,
      context.resource,
      this.toStableListKey(context.roles),
      this.toStableListKey(context.scopes),
    ].join(':');
  }

  private toStableListKey(values: string[]): string {
    return [...values].sort().join(',');
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
