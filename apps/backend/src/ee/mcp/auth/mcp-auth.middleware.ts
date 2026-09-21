import { Inject, Injectable, Logger } from '@nestjs/common';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AuthInfo } from '@modelcontextprotocol/server';
import type { McpScope, McpTokenPayload } from '@owox/idp-protocol';
import { McpResourceResolverService } from '../../../mcp-resource/mcp-resource-resolver.service';
import type { McpResourceContext } from '../../../mcp-resource/mcp-resource-context';
import { McpConfigService } from '../config/mcp.config';
import { MCP_AUTH_PORT, type McpAuthPort } from './mcp-auth.port';

const REQUIRED_SCOPES: McpScope[] = ['mcp:read'];

/**
 * `createMcpHandler`'s auth model is pass-through only (`AuthInfo.verifyAccessToken(token)`,
 * no request/resource context) — it can't do the resource-scoped verification a project-specific
 * vs shared MCP host needs. This replaces the old McpAuthGuard + McpAuthExceptionFilter pair with
 * a plain Express middleware carrying the same verification and the same rejection responses;
 * `toNodeHandler` forwards whatever this sets on `request.auth` to the handler as `authInfo`.
 */
export interface McpAuthenticatedRequest extends Request {
  auth?: AuthInfo;
}

class McpAuthRejection extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpAuthRejection';
  }
}

@Injectable()
export class McpAuthMiddleware {
  private readonly logger = new Logger(McpAuthMiddleware.name);

  constructor(
    @Inject(MCP_AUTH_PORT)
    private readonly auth: McpAuthPort,
    private readonly resourceResolver: McpResourceResolverService,
    private readonly config: McpConfigService
  ) {}

  // Express never awaits a middleware's return value, so an async handler is a safe drop-in — and
  // it lets tests `await middleware.handle(req, res, next)` instead of racing internal promises.
  handle: RequestHandler = async (
    request: McpAuthenticatedRequest,
    response: Response,
    next: NextFunction
  ) => {
    try {
      request.auth = await this.verify(request);
      next();
    } catch (error) {
      this.reject(request, response, error);
    }
  };

  private async verify(request: Request): Promise<AuthInfo> {
    const token = this.extractBearerToken(request);
    const resourceContext = this.resourceResolver.tryResolveRequest(request);
    if (!resourceContext) {
      throw new McpAuthRejection('Invalid MCP resource');
    }

    const payload = await this.auth.verifyToken(token, resourceContext.resource, REQUIRED_SCOPES);
    if (!payload) {
      throw new McpAuthRejection('Invalid MCP bearer token');
    }

    this.assertPayload(payload, resourceContext);
    this.logger.debug('MCP auth accepted', {
      method: request.method,
      url: request.originalUrl ?? request.url,
      requestSessionId: this.getRequestedSessionId(request),
      projectId: payload.projectId,
      clientId: payload.clientId,
      resource: payload.resource,
      scopes: payload.scopes,
      roles: payload.roles,
    });

    // The whole verified payload rides through as one opaque value — read back by
    // toMcpAuthContext() wherever an McpAuthContext is needed (the server factory, request
    // logging). Avoids hand-duplicating every field into AuthInfo's generic shape and back.
    return {
      token,
      clientId: payload.clientId,
      scopes: payload.scopes,
      extra: { mcpContext: payload },
    };
  }

  private reject(request: Request, response: Response, error: unknown): void {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    const metadata = {
      method: request.method,
      url: request.originalUrl ?? request.url,
      requestSessionId: this.getRequestedSessionId(request),
      accept: request.headers?.accept,
      contentType: request.headers?.['content-type'],
      hasAuthorization: Boolean(request.headers?.authorization),
      message,
    };

    if (this.isExpectedAnonymousProbe(request, message)) {
      this.logger.log('MCP auth rejected', metadata);
    } else {
      this.logger.warn('MCP auth rejected', metadata);
    }

    response.setHeader('WWW-Authenticate', this.getChallengeHeader(request));
    response.status(401).json({
      statusCode: 401,
      message,
      error: 'Unauthorized',
    });
  }

  private extractBearerToken(request: Request): string {
    const authorization = request.headers.authorization;
    const value = Array.isArray(authorization) ? authorization[0] : authorization;

    if (!value?.startsWith('Bearer ')) {
      throw new McpAuthRejection('Missing MCP bearer token');
    }

    const token = value.slice('Bearer '.length).trim();
    if (!token) {
      throw new McpAuthRejection('Missing MCP bearer token');
    }

    return token;
  }

  private getRequestedSessionId(request: Request): string | undefined {
    const header = request.headers?.['mcp-session-id'];
    return Array.isArray(header) ? header[0] : header;
  }

  private assertPayload(payload: McpTokenPayload, resourceContext: McpResourceContext): void {
    if (payload.authFlow !== 'mcp') {
      throw new McpAuthRejection('Invalid MCP auth flow');
    }

    if (payload.resource !== resourceContext.resource) {
      throw new McpAuthRejection('Invalid MCP resource');
    }

    if (resourceContext.kind === 'project' && payload.projectId !== resourceContext.projectId) {
      throw new McpAuthRejection('Invalid MCP project context');
    }

    if (!payload.projectId) {
      throw new McpAuthRejection('Missing MCP project context');
    }

    if (!payload.roles.length) {
      throw new McpAuthRejection('Missing MCP project roles');
    }

    for (const scope of REQUIRED_SCOPES) {
      if (!payload.scopes.includes(scope)) {
        throw new McpAuthRejection('Missing MCP scope');
      }
    }
  }

  private getChallengeHeader(request: Request): string {
    const resourceContext = this.resourceResolver.tryResolveRequest(request);
    const metadataUrl = resourceContext
      ? `${resourceContext.publicBaseUrl}/.well-known/oauth-protected-resource`
      : this.config.protectedResourceMetadataUrl;

    return `Bearer resource_metadata="${metadataUrl}", scope="${this.config.scopes.join(' ')}"`;
  }

  private isExpectedAnonymousProbe(request: Request, message: string): boolean {
    return (
      request.method === 'GET' &&
      (request.originalUrl ?? request.url) === '/mcp' &&
      !request.headers?.authorization &&
      message === 'Missing MCP bearer token'
    );
  }
}

/** Recovers the verified McpTokenPayload stashed in `AuthInfo.extra` by {@link McpAuthMiddleware}. */
export function toMcpAuthContext(authInfo: AuthInfo | undefined): McpTokenPayload {
  const mcpContext = authInfo?.extra?.mcpContext;
  if (!mcpContext) {
    throw new Error('MCP request reached the server factory without a verified auth context');
  }

  return mcpContext as McpTokenPayload;
}
