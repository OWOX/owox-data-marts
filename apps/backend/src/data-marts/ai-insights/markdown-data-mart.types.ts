import { TagMetaEntry } from '../../common/markdown/types/markdown-template.types';
import { Options } from './ai-insights-types';

export type DataMartAdditionalParams = {
  projectId: string;
  dataMartId: string;
  wholeTemplate?: string;
  options?: Options;
};

export interface DataMartMarkdownTemplateInput {
  template: string;
  params: DataMartAdditionalParams;
  context?: Record<string, unknown>;
}

export interface DataMartPromptMetaEntry {
  payload: PromptTagPayload;
  meta?: PromptTagMeta;
}

export interface DataMartMarkdownTemplateOutput {
  markdown: string;
  prompts: DataMartPromptMetaEntry[];
}

export interface DataMartMarkdownTemplateFacade {
  render(input: DataMartMarkdownTemplateInput): Promise<DataMartMarkdownTemplateOutput>;
}

export interface PromptTagPayload {
  projectId: string;
  dataMartId: string;
  prompt: string;
  wholeTemplate?: string;
  options?: Options;
}

export interface PromptTagMeta {
  prompt: string;
  artifact: string;
  telemetry?: unknown;
  [key: string]: unknown;
}

export type PromptTagMetaEntry = TagMetaEntry<'prompt', PromptTagPayload, PromptTagMeta>;
