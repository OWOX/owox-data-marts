import { OpenAiChatProvider } from '../../common/ai-insights/services/openai/openai-chat-provider';
import { OpenRouterChatProvider } from '../../common/ai-insights/services/openrouter/openrouter-chat-provider';
import { AiInsightsFacadeImpl } from './facades/ai-insights.facade.impl';
import { PromptTagHandler } from './template/handlers/prompt-tag.handler';
import { DataMartInsightTemplateFacadeImpl } from './data-mart-insight-template.facade';
import { TEMPLATE_RENDER_FACADE } from '../../common/template/types/render-template.types';
import { TemplateRenderFacadeImpl } from '../../common/template/facades/template-render-facade-impl.service';
import { TableNameRetrieverTool } from './tools/table-name-retriever.tool';
import { DataMartsAiInsightsToolsRegistrar } from './tools/data-marts-ai-insights-tools.registrar';
import {
  AI_INSIGHTS_TOOLS_REGISTRARS,
  AiInsightsToolsRegistrar,
} from '../../common/ai-insights/services/ai-insights-tools-registrar';
import { ToolRegistry } from '../../common/ai-insights/agent/tool-registry';
import { AI_INSIGHTS_FACADE } from './ai-insights-types';
import { ConfigService } from '@nestjs/config';
import {
  AI_CHAT_PROVIDER,
  AI_PROVIDER_ENV,
  AiProviderName,
  normalizeAiProviderName,
} from '../../common/ai-insights/services/ai-chat-provider.token';
import { AiInsightsOrchestratorService } from './ai-insight-orchestrator.service';
import { FinalizeAgent } from './agent/finalize.agent';
import { PlanAgent } from './agent/plan.agent';
import { SqlAgent } from './agent/sql.agent';
import { SqlBuilderAgent } from './agent/sql-builder.agent';
import { TriageAgent } from './agent/triage.agent';
import { GenerateInsightAgent } from './agent/generate-insight.agent';
import { SqlErrorAdvisorAgent } from './agent/sql-error-advisor.agent';
import { QueryRepairAgent } from './agent/query-repair.agent';
import { PromptProcessedEventsService } from './prompt-processed-events.service';

export const aiInsightsProviders = [
  OpenAiChatProvider,
  OpenRouterChatProvider,
  AiInsightsFacadeImpl,
  AiInsightsOrchestratorService,
  TriageAgent,
  PlanAgent,
  SqlBuilderAgent,
  SqlAgent,
  QueryRepairAgent,
  SqlErrorAdvisorAgent,
  FinalizeAgent,
  GenerateInsightAgent,
  PromptTagHandler,
  PromptProcessedEventsService,
  DataMartInsightTemplateFacadeImpl,
  {
    provide: AI_CHAT_PROVIDER,
    useFactory: (
      config: ConfigService,
      openai: OpenAiChatProvider,
      openrouter: OpenRouterChatProvider
    ) => {
      const raw = (config.get<string>(AI_PROVIDER_ENV) || '').toLowerCase();
      const provider = normalizeAiProviderName(raw);
      switch (provider) {
        case AiProviderName.OPENAI:
          return openai;
        case AiProviderName.OPENROUTER:
          return openrouter;
        default:
          return openai;
      }
    },
    inject: [ConfigService, OpenAiChatProvider, OpenRouterChatProvider],
  },
  {
    provide: TEMPLATE_RENDER_FACADE,
    useClass: TemplateRenderFacadeImpl,
  },
  TableNameRetrieverTool,
  DataMartsAiInsightsToolsRegistrar,
  {
    provide: AI_INSIGHTS_TOOLS_REGISTRARS,
    useFactory: (dataMarts: DataMartsAiInsightsToolsRegistrar) => [dataMarts],
    inject: [DataMartsAiInsightsToolsRegistrar],
  },
  {
    provide: ToolRegistry,
    useFactory: (registrars: AiInsightsToolsRegistrar[]): ToolRegistry => {
      const registry = new ToolRegistry();
      for (const registrar of registrars ?? []) {
        registrar.registerTools(registry);
      }
      return registry;
    },
    inject: [AI_INSIGHTS_TOOLS_REGISTRARS],
  },
  {
    provide: AI_INSIGHTS_FACADE,
    useClass: AiInsightsFacadeImpl,
  },
];
