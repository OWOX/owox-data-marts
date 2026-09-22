import { Inject, Injectable, Logger } from '@nestjs/common';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AuthInfo } from '@modelcontextprotocol/server';
import { castError } from '@owox/internal-helpers';
import type { McpScope, McpTokenPayload } from '@owox/idp-protocol';
import { McpResourceResolverService } from '../../../mcp-resource/mcp-resource-resolver.service';
import type { McpResourceContext } from '../../../mcp-resource/mcp-resource-context';
import { McpConfigService } from '../config/mcp.config';
import { firstHeaderValue } from '../http-headers.util';
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
  // Resource resolution is computed once here (not re-derived by verify()/reject()) so a second,
  // unguarded throw from it can never leave a request with no response sent.
  handle: RequestHandler = async (
    request: McpAuthenticatedRequest,
    response: Response,
    next: NextFunction
  ) => {
    const resourceContext = this.resolveResourceContext(request);
    try {
      request.auth = await this.verify(request, resourceContext);
      next();
    } catch (error) {
      if (error instanceof McpAuthRejection) {
        this.reject(request, response, error.message, resourceContext);
      } else {
        this.rejectUnexpected(request, response, error);
      }
    }
  };

  // Never throws: an unresolvable resource (bad request) and a resolver failure (bad config) both
  // become `null` here, and verify() turns `null` into the same 'Invalid MCP resource' rejection —
  // the config-failure case is still distinguished from a routine bad request via the ERROR log.
  private resolveResourceContext(request: Request): McpResourceContext | null {
    try {
      return this.resourceResolver.tryResolveRequest(request);
    } catch (error) {
      this.logger.error('MCP resource resolution failed', { message: castError(error).message });
      return null;
    }
  }

  private async verify(
    request: Request,
    resourceContext: McpResourceContext | null
  ): Promise<AuthInfo> {
    const token = this.extractBearerToken(request);
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

  private reject(
    request: Request,
    response: Response,
    message: string,
    resourceContext: McpResourceContext | null
  ): void {
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

    response.setHeader('WWW-Authenticate', this.getChallengeHeader(resourceContext));
    response.status(401).json({
      statusCode: 401,
      message,
      error: 'Unauthorized',
    });
  }

  // Anything that isn't a deliberate McpAuthRejection (e.g. verifyToken failing because IB itself
  // is unreachable) is a server-side failure, not an auth decision — it must not be reported to the
  // caller as a 401 with the internal error message attached, the way a bare catch-all would.
  private rejectUnexpected(request: Request, response: Response, error: unknown): void {
    this.logger.error('MCP auth failed unexpectedly', {
      method: request.method,
      url: request.originalUrl ?? request.url,
      requestSessionId: this.getRequestedSessionId(request),
      message: castError(error).message,
    });

    response.status(500).json({
      statusCode: 500,
      message: 'Internal server error',
      error: 'Internal Server Error',
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
    return firstHeaderValue(request, 'mcp-session-id');
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

  private getChallengeHeader(resourceContext: McpResourceContext | null): string {
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
