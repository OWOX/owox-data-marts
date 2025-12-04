import { OpenAiChatProvider } from '../../common/ai-insights/services/openai/openai-chat-provider';
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
import { TriageAgent } from './agent/triage.agent';

export const aiInsightsProviders = [
  OpenAiChatProvider,
  AiInsightsFacadeImpl,
  AiInsightsOrchestratorService,
  TriageAgent,
  PlanAgent,
  SqlAgent,
  FinalizeAgent,
  PromptTagHandler,
  DataMartInsightTemplateFacadeImpl,
  {
    provide: AI_CHAT_PROVIDER,
    useFactory: (config: ConfigService, openai: OpenAiChatProvider) => {
      const raw = (config.get<string>(AI_PROVIDER_ENV) || '').toLowerCase();
      const provider = normalizeAiProviderName(raw);
      switch (provider) {
        case AiProviderName.OPENAI:
        default:
          return openai;
      }
    },
    inject: [ConfigService, OpenAiChatProvider],
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
