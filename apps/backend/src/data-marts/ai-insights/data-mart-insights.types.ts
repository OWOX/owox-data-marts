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
  promptAnswer?: string;
  payload: PromptTagPayload;
  meta: PromptTagMeta;
}

export enum DataMartInsightTemplateStatus {
  OK = 'ok',
  ERROR = 'error',
}

export interface DataMartInsightTemplateOutput {
  rendered: string;
  status: DataMartInsightTemplateStatus;
  prompts: DataMartPromptMetaEntry[];
}

export interface DataMartInsightTemplateFacade {
  render(input: DataMartInsightTemplateInput): Promise<DataMartInsightTemplateOutput>;
}

export function isPromptAnswerOk(value: PromptAnswer): boolean {
  return value === PromptAnswer.OK;
}

export enum PromptAnswer {
  OK = 'ok',
  NO_DATA = 'no_data',
  NOT_RELEVANT = 'not_relevant',
  CANNOT_ANSWER = 'cannot_answer',
  HIGH_AMBIGUITY = 'high_ambiguity',
  ERROR = 'error',
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
  status: PromptAnswer;
  reasonDescription?: string;
  artifact?: string;
  telemetry: unknown;
  [key: string]: unknown;
}

export type PromptTagMetaEntry = TagMetaEntry<'prompt', PromptTagPayload, PromptTagMeta>;
