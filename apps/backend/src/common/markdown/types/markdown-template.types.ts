import { TagHandler } from '../handlers/tag-handler.interface';

export interface TagRenderedResult<TMeta = unknown> {
  rendered: string;
  meta?: TMeta;
}

export interface TagMetaEntry<
  TTag extends string = string,
  TPayload = unknown,
  TResultMeta = unknown,
> {
  tag: TTag;
  payload: TPayload;
  resultMeta?: TResultMeta;
}

export interface MarkdownTagsMeta<TTagMeta extends TagMetaEntry = TagMetaEntry> {
  tags: TTagMeta[];
}

export const COLLECTOR_SYMBOL = Symbol('markdownTemplateTagCollector');

export type CollectedCall<TPayload, TResultMeta> = {
  handler: TagHandler<TPayload, TagRenderedResult<TResultMeta>>;
  payload: TPayload;
};

export type TagCollector<TTagMeta extends TagMetaEntry> = {
  calls: Array<CollectedCall<TTagMeta['payload'], TTagMeta['resultMeta']>>;
};

export const ADDITIONAL_PARAMS_SYMBOL = Symbol('markdownAdditionalParams');

export type RootWithAdditional<TAdditional = unknown> = Record<string | symbol, unknown> & {
  [ADDITIONAL_PARAMS_SYMBOL]?: TAdditional;
};
