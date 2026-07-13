import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isMcpProjectId } from './mcp-project-id';
import type { McpResourceContext } from './mcp-resource-context';

interface McpRequestLike {
  protocol?: string;
  host?: string;
  headers?: Record<string, string | string[] | undefined>;
}

export class McpInvalidResourceError extends Error {
  constructor() {
    super('invalid MCP resource');
  }
}

@Injectable()
export class McpResourceResolverService {
  constructor(private readonly config: ConfigService) {}

  resolveResource(resource: string): McpResourceContext {
    const sharedResource = this.sharedResource;
    if (resource === sharedResource) {
      return {
        kind: 'shared',
        resource: sharedResource,
        publicBaseUrl: this.publicBaseUrl,
        projectId: null,
      };
    }

    const parsedResource = this.parseResourceUrl(resource);
    const sharedBase = this.parsePublicBaseUrl();
    const projectSuffix = `.${sharedBase.hostname}`;

    if (
      parsedResource.protocol !== sharedBase.protocol ||
      parsedResource.pathname !== '/mcp' ||
      parsedResource.search !== '' ||
      parsedResource.hash !== '' ||
      !parsedResource.hostname.endsWith(projectSuffix)
    ) {
      throw new McpInvalidResourceError();
    }

    const projectId = parsedResource.hostname.slice(0, -projectSuffix.length);
    if (!isMcpProjectId(projectId)) {
      throw new McpInvalidResourceError();
    }

    return {
      kind: 'project',
      resource: parsedResource.toString(),
      publicBaseUrl: `${parsedResource.protocol}//${parsedResource.host}`,
      projectId,
    };
  }

  resolveRequest(request: McpRequestLike): McpResourceContext {
    const host = request.host ?? this.firstHeader(request.headers?.host);
    if (!host) {
      throw new McpInvalidResourceError();
    }

    const protocol = request.protocol ?? this.publicBaseProtocol;

    return this.resolveResource(`${protocol}://${host}/mcp`);
  }

  tryResolveRequest(request: McpRequestLike): McpResourceContext | null {
    try {
      return this.resolveRequest(request);
    } catch (error) {
      if (error instanceof McpInvalidResourceError) {
        return null;
      }
      throw error;
    }
  }

  metadataUrlForRequest(request: McpRequestLike): string {
    return `${this.resolveRequest(request).publicBaseUrl}/.well-known/oauth-protected-resource`;
  }

  projectUrl(projectId: string): string {
    if (!isMcpProjectId(projectId)) {
      throw new Error('invalid MCP project id');
    }

    const publicBaseUrl = this.parsePublicBaseUrl();
    return `${publicBaseUrl.protocol}//${projectId}.${publicBaseUrl.host}/mcp`;
  }

  private get publicBaseUrl(): string {
    const value = this.config.get<string>('MCP_PUBLIC_BASE_URL')?.trim();
    if (!value) {
      throw new Error('MCP_PUBLIC_BASE_URL is required for MCP');
    }
    return value.replace(/\/$/, '');
  }

  private get publicBaseProtocol(): string {
    return this.parsePublicBaseUrl().protocol.replace(/:$/, '');
  }

  private get sharedResource(): string {
    return (
      this.config.get<string>('MCP_OAUTH_RESOURCE')?.trim().replace(/\/$/, '') ??
      `${this.publicBaseUrl}/mcp`
    );
  }

  private parseResourceUrl(value: string): URL {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new McpInvalidResourceError();
    }

    return url;
  }

  private parsePublicBaseUrl(): URL {
    let url: URL;
    try {
      url = new URL(this.publicBaseUrl);
    } catch {
      throw new Error('MCP_PUBLIC_BASE_URL must be a valid URL');
    }

    return url;
  }

  private firstHeader(value: string | string[] | undefined): string | undefined {
    const raw = Array.isArray(value) ? value[0] : value;
    return raw?.split(',')[0]?.trim() || undefined;
  }
}
