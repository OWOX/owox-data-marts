import { BadRequestException, Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { McpResourceResolverService } from '../../../mcp-resource/mcp-resource-resolver.service';
import {
  OAuthDynamicClientRegistrationRequest,
  OAuthDynamicClientService,
} from '../oauth-dynamic-client.service';
import { OAuthConfigService } from '../oauth-config.service';

@Controller('/oauth')
export class OAuthRegistrationController {
  constructor(
    private readonly dynamicClientService: OAuthDynamicClientService,
    private readonly resourceResolver: McpResourceResolverService,
    private readonly config: OAuthConfigService
  ) {}

  @Post('/register')
  register(@Body() body: OAuthDynamicClientRegistrationRequest, @Req() request: Request) {
    const resourceContext = this.resourceResolver.tryResolveRequest(request);
    const resource =
      resourceContext?.resource ?? this.getSharedResourceForAuthorizationServer(request);
    if (!resource) {
      throw new BadRequestException('dynamic client registration requires an MCP resource host');
    }

    return this.dynamicClientService.register(body, resource);
  }

  private getSharedResourceForAuthorizationServer(request: Request): string | null {
    const host = request.host ?? request.headers.host;
    if (!host) {
      return null;
    }

    try {
      const requestOrigin = new URL(`${request.protocol ?? 'https'}://${host}`).origin;
      return requestOrigin === new URL(this.config.issuer).origin ? this.config.resource : null;
    } catch {
      return null;
    }
  }
}
