import { TagMetaEntry } from '../../common/template/types/render-template.types';
import { Options } from './ai-insights-types';

export type DataMartAdditionalParams = {
  projectId: string;
  dataMartId: string;
  wholeTemplate?: string;
  options?: Options;
};

export interface DataMartInsightTemplateInput {
  template: string;
  params: DataMartAdditionalParams;
  context?: Record<string, unknown>;
}

export interface DataMartPromptMetaEntry {
  payload: PromptTagPayload;
  meta?: PromptTagMeta;
}

export interface DataMartInsightTemplateOutput {
  rendered: string;
  prompts: DataMartPromptMetaEntry[];
}

export interface DataMartInsightTemplateFacade {
  render(input: DataMartInsightTemplateInput): Promise<DataMartInsightTemplateOutput>;
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
