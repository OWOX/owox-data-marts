import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { McpScope, McpTokenPayload } from '@owox/idp-protocol';
import { McpConfigService } from '../config/mcp.config';
import { MCP_AUTH_PORT, type McpAuthPort } from './mcp-auth.port';

interface MutableMcpRequest extends Request {
  mcpContext?: McpTokenPayload;
}

@Injectable()
export class McpAuthGuard implements CanActivate {
  private readonly logger = new Logger(McpAuthGuard.name);
  private readonly requiredScopes: McpScope[] = ['mcp:read'];

  constructor(
    @Inject(MCP_AUTH_PORT)
    private readonly auth: McpAuthPort,
    private readonly config: McpConfigService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<MutableMcpRequest>();
    const token = this.extractBearerToken(request);

    const payload = await this.auth.verifyToken(token, this.requiredScopes);
    if (!payload) {
      throw new UnauthorizedException('Invalid MCP bearer token');
    }

    this.assertPayload(payload);
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
    request.mcpContext = payload;

    return true;
  }

  private extractBearerToken(request: Request): string {
    const authorization = request.headers.authorization;
    const value = Array.isArray(authorization) ? authorization[0] : authorization;

    if (!value?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing MCP bearer token');
    }

    const token = value.slice('Bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedException('Missing MCP bearer token');
    }

    return token;
  }

  private getRequestedSessionId(request: Request): string | undefined {
    const header = request.headers?.['mcp-session-id'];
    return Array.isArray(header) ? header[0] : header;
  }

  private assertPayload(payload: McpTokenPayload): void {
    if (payload.authFlow !== 'mcp') {
      throw new UnauthorizedException('Invalid MCP auth flow');
    }

    if (payload.resource !== this.config.resource) {
      throw new UnauthorizedException('Invalid MCP resource');
    }

    if (!payload.projectId) {
      throw new UnauthorizedException('Missing MCP project context');
    }

    if (!payload.roles.length) {
      throw new UnauthorizedException('Missing MCP project roles');
    }

    for (const scope of this.requiredScopes) {
      if (!payload.scopes.includes(scope)) {
        throw new UnauthorizedException('Missing MCP scope');
      }
    }
  }
}
