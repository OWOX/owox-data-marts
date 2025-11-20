import { Module } from '@nestjs/common';
import { OpenAiToolCallingClient } from './services/openai/openai-tool-calling.client';
import { ToolRegistryService } from './agent/tool-registry.service';

@Module({
  providers: [OpenAiToolCallingClient, ToolRegistryService],
  exports: [OpenAiToolCallingClient, ToolRegistryService],
})
export class AiInsightsModule {}
