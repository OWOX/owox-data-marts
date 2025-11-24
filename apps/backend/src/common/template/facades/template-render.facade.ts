import { TagHandler } from '../handlers/tag-handler.interface';
import {
  TagMetaEntry,
  TagRenderedResult,
  TemplateRenderInput,
  TemplateRenderOutput,
  TemplateTagsMeta,
} from '../types/render-template.types';

export interface TemplateRenderFacade<
  TTagMeta extends TagMetaEntry = TagMetaEntry,
  TAdditional = unknown,
> {
  render(
    input: TemplateRenderInput<TAdditional>,
    handlers: ReadonlyArray<
      TagHandler<TTagMeta['payload'], TagRenderedResult<TTagMeta['resultMeta']>>
    >
  ): Promise<TemplateRenderOutput<TemplateTagsMeta<TTagMeta>>>;
}
