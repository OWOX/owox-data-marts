import { TagHandler } from '../handlers/tag-handler.interface';

export const TEMPLATE_RENDER_FACADE = Symbol('TEMPLATE_RENDER_FACADE');

export type TemplateRenderInput<TAdditional = unknown> = {
  template: string;
  context?: Record<string, unknown>;
  additionalParams?: TAdditional;
};

export type TemplateRenderOutput<TMeta = Record<string, unknown>> = {
  rendered?: string;
  meta: TMeta;
};

export interface TagRenderedResult<TMeta = unknown> {
  rendered?: string;
  meta: TMeta;
}

export interface TagMetaEntry<
  TTag extends string = string,
  TPayload = unknown,
  TResultMeta = unknown,
  TResult = unknown,
> {
  tag: TTag;
  payload: TPayload;
  resultMeta: TResultMeta;
  result: TResult;
}

export interface TemplateTagsMeta<TTagMeta extends TagMetaEntry = TagMetaEntry> {
  tags: TTagMeta[];
}

export const COLLECTOR_SYMBOL = Symbol('TemplateRenderTagCollector');

export type CollectedCall<TPayload, TResultMeta> = {
  handler: TagHandler<TPayload, TagRenderedResult<TResultMeta>>;
  payload: TPayload;
};

export type TagCollector<TTagMeta extends TagMetaEntry> = {
  calls: Array<CollectedCall<TTagMeta['payload'], TTagMeta['resultMeta']>>;
};

export const ADDITIONAL_PARAMS_SYMBOL = Symbol('TemplateRenderAdditionalParams');

export type RootWithAdditional<TAdditional = unknown> = Record<string | symbol, unknown> & {
  [ADDITIONAL_PARAMS_SYMBOL]?: TAdditional;
};
