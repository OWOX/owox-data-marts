import { TagMetaEntry } from '../../common/template/types/render-template.types';
import { DataMart } from '../entities/data-mart.entity';
import { Options } from './ai-insights-types';
import { AgentTelemetry } from '../../common/ai-insights/agent/types';

export type DataMartAdditionalParams = {
  projectId: string;
  dataMartId: string;
  wholeTemplate?: string;
  options?: Options;
};

export interface ConsumptionContext {
  contextType: 'INSIGHT' | 'REPORT';
  contextId: string;
  contextTitle: string;
  dataMart: DataMart;
}

export type PromptProcessedEntityName = 'INSIGHT' | 'REPORT';

export interface PromptProcessedContext {
  entityName: PromptProcessedEntityName;
  entityId: string;
  userId: string;
  projectId: string;
}

export interface DataMartInsightTemplateInput {
  template: string;
  params: DataMartAdditionalParams;
  context?: Record<string, unknown>;
  consumptionContext?: ConsumptionContext;
  promptProcessedContext?: PromptProcessedContext;
}

export interface DataMartPromptMetaEntry {
  promptAnswer?: string;
  payload: PromptTagPayload;
  meta: PromptTagMeta;
}

export enum DataMartInsightTemplateStatus {
  OK = 'ok',
  WARNING = 'warning',
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

export function isPromptAnswerError(value: PromptAnswer): boolean {
  return value === PromptAnswer.ERROR;
}

export function isPromptAnswerRestricted(value: PromptAnswer): boolean {
  return value === PromptAnswer.RESTRICTED;
}

export function isPromptAnswerWarning(value: PromptAnswer): boolean {
  return (
    !isPromptAnswerOk(value) && !isPromptAnswerError(value) && !isPromptAnswerRestricted(value)
  );
}

export enum PromptAnswer {
  OK = 'ok',
  NO_DATA = 'no_data',
  NOT_RELEVANT = 'not_relevant',
  CANNOT_ANSWER = 'cannot_answer',
  HIGH_AMBIGUITY = 'high_ambiguity',
  RESTRICTED = 'restricted',
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
  sanitizedPrompt: string | null;
  status: PromptAnswer;
  reasonDescription?: string;
  artifact?: string;
  telemetry: AgentTelemetry;
  [key: string]: unknown;
}

export type PromptTagMetaEntry = TagMetaEntry<'prompt', PromptTagPayload, PromptTagMeta>;
