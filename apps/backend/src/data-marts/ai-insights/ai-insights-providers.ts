import { OpenAiToolCallingClient } from '../../common/ai-insights/services/openai/openai-tool-calling.client';
import { AiInsightsFacadeImpl } from './facades/ai-insights.facade.impl';
import { AiInsightsAgentService } from './agent.service';
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

export const aiInsightsProviders = [
  OpenAiToolCallingClient,
  AiInsightsFacadeImpl,
  AiInsightsAgentService,
  PromptTagHandler,
  DataMartInsightTemplateFacadeImpl,
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
