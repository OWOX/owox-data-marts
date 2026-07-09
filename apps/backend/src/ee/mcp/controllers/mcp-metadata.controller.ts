import {
  BadRequestException,
  Controller,
  Get,
  Header,
  NotFoundException,
  Req,
} from '@nestjs/common';
import { OAuthProtectedResourceMetadataSchema } from '@owox/idp-protocol';
import type { Request } from 'express';
import { McpResourceResolverService } from '../../../mcp-resource/mcp-resource-resolver.service';
import { McpConfigService } from '../config/mcp.config';

const PROTECTED_RESOURCE_METADATA_PATHS = [
  '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-protected-resource/mcp',
  '/mcp/.well-known/oauth-protected-resource',
];

const OPENAI_APPS_CHALLENGE_PATH = '/.well-known/openai-apps-challenge';

@Controller()
export class McpMetadataController {
  constructor(
    private readonly config: McpConfigService,
    private readonly resourceResolver: McpResourceResolverService
  ) {}

  @Get(PROTECTED_RESOURCE_METADATA_PATHS)
  getProtectedResourceMetadata(@Req() request: Request) {
    const resourceContext = this.resourceResolver.tryResolveRequest(request);
    if (!resourceContext) {
      throw new BadRequestException('invalid MCP resource');
    }

    return OAuthProtectedResourceMetadataSchema.parse({
      resource: resourceContext.resource,
      authorization_servers: [resourceContext.publicBaseUrl],
      scopes_supported: this.config.scopes,
      resource_documentation: this.config.resourceDocumentationUrl,
    });
  }

  /**
   * OpenAI Apps domain verification. OpenAI pings this origin-root well-known URL
   * and expects the verification token back as plain text with a 200. Public (no
   * auth, no `/api` prefix — see PROTOCOL_ROUTE_EXCLUSIONS). Returns 404 until the
   * token is configured so we never publish an empty challenge.
   */
  @Get(OPENAI_APPS_CHALLENGE_PATH)
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  getOpenaiAppsChallenge(): string {
    const token = this.config.openaiAppsChallengeToken;
    if (!token) {
      throw new NotFoundException();
    }
    return token;
  }
}
