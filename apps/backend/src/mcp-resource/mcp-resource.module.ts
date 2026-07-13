import { Module } from '@nestjs/common';
import { McpResourceResolverService } from './mcp-resource-resolver.service';

@Module({
  providers: [McpResourceResolverService],
  exports: [McpResourceResolverService],
})
export class McpResourceModule {}
