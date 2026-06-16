import { Controller, Get } from '@nestjs/common';
import { OAuthProtectedResourceMetadataSchema } from '@owox/idp-protocol';
import { McpConfigService } from '../config/mcp.config';

const PROTECTED_RESOURCE_METADATA_PATHS = [
  '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-protected-resource/mcp',
  '/mcp/.well-known/oauth-protected-resource',
];

@Controller()
export class McpMetadataController {
  constructor(private readonly config: McpConfigService) {}

  @Get(PROTECTED_RESOURCE_METADATA_PATHS)
  getProtectedResourceMetadata() {
    return OAuthProtectedResourceMetadataSchema.parse({
      resource: this.config.resource,
      authorization_servers: [this.config.authorizationServer],
      scopes_supported: this.config.scopes,
      resource_documentation: this.config.resourceDocumentationUrl,
    });
  }
}
