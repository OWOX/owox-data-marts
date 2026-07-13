import { BadRequestException, Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { McpResourceResolverService } from '../../../mcp-resource/mcp-resource-resolver.service';
import {
  OAuthDynamicClientRegistrationRequest,
  OAuthDynamicClientService,
} from '../oauth-dynamic-client.service';

@Controller('/oauth')
export class OAuthRegistrationController {
  constructor(
    private readonly dynamicClientService: OAuthDynamicClientService,
    private readonly resourceResolver: McpResourceResolverService
  ) {}

  @Post('/register')
  register(@Body() body: OAuthDynamicClientRegistrationRequest, @Req() request: Request) {
    const resourceContext = this.resourceResolver.tryResolveRequest(request);
    if (!resourceContext) {
      throw new BadRequestException('dynamic client registration requires an MCP resource host');
    }

    return this.dynamicClientService.register(body, resourceContext.resource);
  }
}
