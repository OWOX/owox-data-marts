import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import {
  createMcpHandler,
  UnsupportedProtocolVersionError,
  type McpHttpHandler,
} from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { ClsContextService } from '../../../common/logger/cls-context.service';
import { toMcpAuthContext, type McpAuthenticatedRequest } from '../auth/mcp-auth.middleware';
import { McpAuthMiddleware } from '../auth/mcp-auth.middleware';
import { McpInstructionsService } from '../instructions/mcp-instructions.service';
import { MCP_LOG_CONTEXT_KEY } from '../observability/mcp-log-context';
import { McpSdkServerFactory } from '../sdk/mcp-sdk-server.factory';

// Above query_data_mart's 3-min deadline so the global socket-idle timeout (SERVER_TIMEOUT_MS)
// doesn't blunt-reset a computing MCP call before it can return a clean query_timeout. LB (1h) caps.
export const MCP_REQUEST_SOCKET_TIMEOUT_MS = 4 * 60_000;

// Protocol revisions ODM's MCP endpoint is meant to serve post-migration: the 2026-07-28 "modern"
// era plus every "legacy" 2025/2024 revision the previous SDK generation supported. Used only to
// decide onerror's log severity for a rejected protocol version — never for negotiation itself,
// which createMcpHandler owns entirely.
const EXPECTED_SUPPORTED_PROTOCOL_VERSIONS = new Set([
  '2026-07-28',
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
  '2024-10-07',
]);

/**
 * Mounts /mcp directly on the underlying Express app instead of as a NestJS controller.
 * createMcpHandler (protocol 2026-07-28 support, with automatic 2024-2025 fallback via
 * `legacy: 'stateless'`) is a web-standard `{fetch}` handler, not a NestJS-shaped one — see
 * docs/protocol-versions.md and docs/serving/express.md in the modelcontextprotocol/typescript-sdk
 * repo. Auth (McpAuthMiddleware), CLS logging context, the socket-timeout override, and
 * request/response logging are ported here from the retired McpTransportController /
 * McpAuthGuard / McpAuthExceptionFilter, since none of that NestJS wiring reaches a raw-mounted
 * route.
 */
@Injectable()
export class McpHttpEntryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(McpHttpEntryService.name);
  private handler?: McpHttpHandler;

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly authMiddleware: McpAuthMiddleware,
    private readonly serverFactory: McpSdkServerFactory,
    private readonly instructionsService: McpInstructionsService,
    private readonly clsContextService: ClsContextService
  ) {}

  onModuleInit(): void {
    const express = this.adapterHost.httpAdapter.getInstance<Express>();

    this.handler = createMcpHandler(
      ({ authInfo }) =>
        this.serverFactory.create(
          toMcpAuthContext(authInfo),
          this.instructionsService.getInstructions()
        ),
      { onerror: error => this.onTransportError(error) }
    );
    const nodeHandler = toNodeHandler(this.handler);

    express.all(
      '/mcp',
      this.authMiddleware.handle,
      (request: McpAuthenticatedRequest, response: Response) =>
        this.handleRequest(request, response, nodeHandler)
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.handler?.close();
  }

  private async handleRequest(
    request: McpAuthenticatedRequest,
    response: Response,
    nodeHandler: (req: Request, res: Response, body?: unknown) => Promise<void>
  ): Promise<void> {
    if (typeof request.setTimeout === 'function') {
      request.setTimeout(MCP_REQUEST_SOCKET_TIMEOUT_MS);
    }

    const requestId = randomUUID();
    const requestSessionId = this.getRequestedSessionId(request);
    const mcpContext = toMcpAuthContext(request.auth);

    await this.clsContextService.runWithContext(
      MCP_LOG_CONTEXT_KEY,
      {
        projectId: mcpContext.projectId,
        userId: mcpContext.userId,
        clientId: mcpContext.clientId,
        sessionId: requestSessionId,
        requestId,
        protocolVersion: this.firstHeader(request, 'mcp-protocol-version'),
        userAgent: this.firstHeader(request, 'user-agent'),
        clientVendor: this.firstHeader(request, 'x-anthropic-client'),
        traceparent: this.firstHeader(request, 'traceparent'),
      },
      async () => {
        const startedAt = Date.now();
        const rpc = this.getJsonRpcSummary(request.body);

        this.logger.debug('MCP request received', {
          method: request.method,
          url: request.originalUrl ?? request.url,
          requestSessionId,
          accept: request.headers?.accept,
          contentType: request.headers?.['content-type'],
          rpc,
          projectId: mcpContext.projectId,
          clientId: mcpContext.clientId,
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
              projectId: mcpContext.projectId,
              userId: mcpContext.userId,
              clientId: mcpContext.clientId,
              requestId,
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

        await nodeHandler(request, response, request.body);
      }
    );
  }

  /**
   * createMcpHandler's onerror is reporting-only (never alters the response). A rejection for a
   * protocol revision ODM is meant to support post-migration is a regression worth paging on —
   * DoD requires ERROR + structured context so existing alerting catches it, unlike the WARN this
   * previously silently accumulated as. A rejection for a genuinely unsupported (future/garbage)
   * revision is expected client behavior and stays at WARN.
   */
  private onTransportError(error: Error): void {
    const isVersionRejection = UnsupportedProtocolVersionError.isInstance(error);
    const metadata = {
      message: error.message,
      requestedProtocolVersion: isVersionRejection ? error.requested : undefined,
      supportedProtocolVersions: isVersionRejection ? error.supported : undefined,
    };

    if (isVersionRejection && EXPECTED_SUPPORTED_PROTOCOL_VERSIONS.has(error.requested)) {
      this.logger.error('MCP rejected a protocol version it is expected to support', metadata);
      return;
    }

    this.logger.warn('MCP SDK transport error', metadata);
  }

  private firstHeader(request: Request, name: string): string | undefined {
    const header = request.headers?.[name];
    return Array.isArray(header) ? header[0] : header;
  }

  private getRequestedSessionId(request: Request): string | undefined {
    return this.firstHeader(request, 'mcp-session-id');
  }

  private isExpectedStandaloneSseRejection(request: Request, response: Response): boolean {
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
