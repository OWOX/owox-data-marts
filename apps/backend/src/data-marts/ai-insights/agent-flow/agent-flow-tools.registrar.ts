import { Injectable } from '@nestjs/common';
import { AiContext } from '../../../common/ai-insights/agent/types';
import { ToolRegistry } from '../../../common/ai-insights/agent/tool-registry';
import { AgentFlowContext } from './types';
import {
  ListTemplateSourcesTool,
  ListTemplateSourcesInput,
  ListTemplateSourcesInputSchema,
  ListTemplateSourcesInputJsonSchema,
} from './tools/list-template-sources.tool';
import {
  ListArtifactsTool,
  ListArtifactsInput,
  ListArtifactsInputSchema,
  ListArtifactsInputJsonSchema,
} from './tools/list-artifacts.tool';
import {
  GetTemplateContentTool,
  GetTemplateContentInput,
  GetTemplateContentInputSchema,
  GetTemplateContentInputJsonSchema,
} from './tools/get-template-content.tool';
import {
  ProposeRemoveSourceTool,
  ProposeRemoveSourceInput,
  ProposeRemoveSourceInputSchema,
  ProposeRemoveSourceInputJsonSchema,
} from './tools/propose-remove-source.tool';
import {
  GenerateSqlTool,
  GenerateSqlInput,
  GenerateSqlInputSchema,
  GenerateSqlInputJsonSchema,
} from './tools/generate-sql.tool';
import { ListAvailableTagsTool } from './tools/list-available-tags.tool';

export enum AgentFlowTools {
  LIST_TEMPLATE_SOURCES = 'source_list_template_sources',
  LIST_ARTIFACTS = 'source_list_artifacts',
  GET_TEMPLATE_CONTENT = 'source_get_template_content',
  PROPOSE_REMOVE_SOURCE = 'source_propose_remove_source',
  GENERATE_SQL = 'source_generate_sql',
  LIST_AVAILABLE_TAGS = 'source_list_available_tags',
}

function asFlowCtx(ctx: AiContext): AgentFlowContext {
  return ctx as AgentFlowContext;
}

@Injectable()
export class AgentFlowToolsRegistrar {
  constructor(
    private readonly listTemplateSourcesTool: ListTemplateSourcesTool,
    private readonly listArtifactsTool: ListArtifactsTool,
    private readonly getTemplateContentTool: GetTemplateContentTool,
    private readonly proposeRemoveSourceTool: ProposeRemoveSourceTool,
    private readonly generateSqlTool: GenerateSqlTool,
    private readonly listAvailableTagsTool: ListAvailableTagsTool
  ) {}

  registerTools(registry: ToolRegistry): void {
    registry.register({
      name: AgentFlowTools.LIST_TEMPLATE_SOURCES,
      description:
        'Returns the list of data sources already linked to the current insight template. ' +
        'Each source includes its key, kind (table/value), linked artifact ID, and the full SQL. ' +
        'Use this first to understand what data is already present in the report. ' +
        'Linked sources also include baseSqlHandle for source_generate_sql refine mode.',
      inputJsonSchema: ListTemplateSourcesInputJsonSchema,
      inputZod: ListTemplateSourcesInputSchema,
      execute: (args: unknown, ctx: AiContext) =>
        this.listTemplateSourcesTool.execute(args as ListTemplateSourcesInput, asFlowCtx(ctx)),
      isFinal: false,
    });

    registry.register({
      name: AgentFlowTools.LIST_ARTIFACTS,
      description:
        'Returns all data artifacts in this data mart that are NOT yet linked to the current template. ' +
        'Each artifact includes its ID, title, and full SQL. ' +
        "Read the SQL to determine if an artifact already answers the user's question. " +
        'Artifacts include baseSqlHandle for source_generate_sql refine mode.',
      inputJsonSchema: ListArtifactsInputJsonSchema,
      inputZod: ListArtifactsInputSchema,
      execute: (args: unknown, ctx: AiContext) =>
        this.listArtifactsTool.execute(args as ListArtifactsInput, asFlowCtx(ctx)),
      isFinal: false,
    });

    registry.register({
      name: AgentFlowTools.GET_TEMPLATE_CONTENT,
      description:
        'Returns the full markdown content of the current insight template. ' +
        'Use this to read and understand the template structure before making text edits.',
      inputJsonSchema: GetTemplateContentInputJsonSchema,
      inputZod: GetTemplateContentInputSchema,
      execute: (args: unknown, ctx: AiContext) =>
        this.getTemplateContentTool.execute(args as GetTemplateContentInput, asFlowCtx(ctx)),
      isFinal: false,
    });

    registry.register({
      name: AgentFlowTools.PROPOSE_REMOVE_SOURCE,
      description:
        'Proposes removing a data source from the current template. ' +
        'Template markdown changes must be returned separately via templateEditIntent (full replace). ' +
        'Use this when the user explicitly asks to remove or delete a source/chart from the report.',
      inputJsonSchema: ProposeRemoveSourceInputJsonSchema,
      inputZod: ProposeRemoveSourceInputSchema,
      execute: (args: unknown, ctx: AiContext) =>
        Promise.resolve(
          this.proposeRemoveSourceTool.execute(args as ProposeRemoveSourceInput, asFlowCtx(ctx))
        ),
      isFinal: false,
    });

    registry.register({
      name: AgentFlowTools.GENERATE_SQL,
      description:
        "Generates new SQL or refines existing SQL to answer the user's data question. " +
        'Internally runs the full SQL pipeline (triage → plan → build → dry-run → repair). ' +
        'For new SQL use mode="create" (optionally pass taskPrompt to scope one subtask from a multi-task message; this prevents mixing tasks in one SQL). ' +
        'For refine use mode="refine" with BOTH baseSqlHandle and refineInstructions (preferred). ' +
        'Use baseSqlText only as a fallback when the user explicitly pasted SQL and no handle exists. ' +
        'Do not send refine fields in create mode. ' +
        'Base SQL is resolved server-side from baseSqlHandle (rev:/src:/art:).',
      inputJsonSchema: GenerateSqlInputJsonSchema,
      inputZod: GenerateSqlInputSchema,
      execute: (args: unknown, ctx: AiContext) =>
        this.generateSqlTool.execute(args as GenerateSqlInput, asFlowCtx(ctx)),
      isFinal: false,
    });

    registry.register({
      name: AgentFlowTools.LIST_AVAILABLE_TAGS,
      description: this.listAvailableTagsTool.description,
      inputJsonSchema: {},
      inputZod: this.listAvailableTagsTool.inputSchema,
      execute: (args: unknown, ctx: AiContext) =>
        Promise.resolve(this.listAvailableTagsTool.execute({}, asFlowCtx(ctx))),
      isFinal: false,
    });
  }
}
