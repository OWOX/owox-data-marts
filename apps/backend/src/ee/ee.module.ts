import { Module } from '@nestjs/common';
import { DataMartsModule } from '../data-marts/data-marts.module';
import { IdpModule } from '../idp/idp.module';
import { IdpMcpAuthAdapter } from './mcp/auth/idp-mcp-auth.adapter';
import { MCP_AUTH_PORT } from './mcp/auth/mcp-auth.port';
import { McpAuthExceptionFilter } from './mcp/auth/mcp-auth.exception-filter';
import { McpAuthGuard } from './mcp/auth/mcp-auth.guard';
import { McpConfigService } from './mcp/config/mcp.config';
import { McpMetadataController } from './mcp/controllers/mcp-metadata.controller';
import { McpTransportController } from './mcp/controllers/mcp-transport.controller';
import { McpSdkServerFactory } from './mcp/sdk/mcp-sdk-server.factory';
import { McpStreamableHttpSessionRegistry } from './mcp/sdk/mcp-streamable-http-session.registry';
import {
  MCP_TOOL_DEFINITIONS_PROVIDER,
  MCP_TOOL_PROVIDER_CLASSES,
} from './mcp/tools/mcp-tool.providers';
import { McpToolRegistry } from './mcp/tools/mcp-tool.registry';

@Module({
  imports: [IdpModule, DataMartsModule],
  controllers: [McpMetadataController, McpTransportController],
  providers: [
    McpConfigService,
    IdpMcpAuthAdapter,
    {
      provide: MCP_AUTH_PORT,
      useExisting: IdpMcpAuthAdapter,
    },
    McpAuthGuard,
    McpAuthExceptionFilter,
    ...MCP_TOOL_PROVIDER_CLASSES,
    MCP_TOOL_DEFINITIONS_PROVIDER,
    McpToolRegistry,
    McpSdkServerFactory,
    McpStreamableHttpSessionRegistry,
  ],
  exports: [McpConfigService],
})
export class EeModule {}
