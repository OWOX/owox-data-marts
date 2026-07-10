import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { DataMartsModule } from '../data-marts/data-marts.module';
import { IdpModule } from '../idp/idp.module';
import { McpResourceModule } from '../mcp-resource/mcp-resource.module';
import { ProjectSettingsModule } from '../project-settings/project-settings.module';
import { IdpMcpAuthAdapter } from './mcp/auth/idp-mcp-auth.adapter';
import { MCP_AUTH_PORT } from './mcp/auth/mcp-auth.port';
import { McpAuthExceptionFilter } from './mcp/auth/mcp-auth.exception-filter';
import { McpAuthGuard } from './mcp/auth/mcp-auth.guard';
import { McpConfigService } from './mcp/config/mcp.config';
import { McpMetadataController } from './mcp/controllers/mcp-metadata.controller';
import { McpTransportController } from './mcp/controllers/mcp-transport.controller';
import { McpBusExtrasModule } from './mcp/observability/mcp-bus-extras.module';
import { McpCallInstrumentation } from './mcp/observability/mcp-call-instrumentation';
import { McpSdkServerFactory } from './mcp/sdk/mcp-sdk-server.factory';
import { McpStreamableHttpTransportHandler } from './mcp/sdk/mcp-streamable-http-transport.handler';
import { McpInstructionsService } from './mcp/instructions/mcp-instructions.service';
import {
  MCP_TOOL_DEFINITIONS_PROVIDER,
  MCP_TOOL_PROVIDER_CLASSES,
} from './mcp/tools/mcp-tool.providers';
import { McpToolRegistry } from './mcp/tools/mcp-tool.registry';

@Module({
  imports: [
    IdpModule,
    DataMartsModule,
    CommonModule,
    McpResourceModule,
    ProjectSettingsModule,
    McpBusExtrasModule,
  ],
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
    McpCallInstrumentation,
    McpSdkServerFactory,
    McpInstructionsService,
    McpStreamableHttpTransportHandler,
  ],
  exports: [McpConfigService],
})
export class EeModule {}
