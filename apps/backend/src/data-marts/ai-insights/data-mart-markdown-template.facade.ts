import {
  DataMartAdditionalParams,
  DataMartMarkdownTemplateFacade,
  DataMartMarkdownTemplateInput,
  DataMartMarkdownTemplateOutput,
  DataMartPromptMetaEntry,
  PromptTagMetaEntry,
} from './markdown-data-mart.types';
import {
  MarkdownTemplateToMarkdownFacade,
  MarkdownTemplateToMarkdownInput,
} from '../../common/markdown/facades/markdown-template-to-markdown.facade';
import { MarkdownTagsMeta } from '../../common/markdown/types/markdown-template.types';
import { MarkdownTemplateToMarkdownFacadeImpl } from '../../common/markdown/facades/markdown-template-to-markdown.facade.impl';
import { PromptTagHandler } from './template/handlers/prompt-tag.handler';
import { Injectable } from '@nestjs/common';

@Injectable()
export class DataMartMarkdownTemplateFacadeImpl implements DataMartMarkdownTemplateFacade {
  private readonly base: MarkdownTemplateToMarkdownFacade<
    MarkdownTagsMeta<PromptTagMetaEntry>,
    DataMartAdditionalParams
  >;

  constructor(private readonly promptHandler: PromptTagHandler) {
    this.base = new MarkdownTemplateToMarkdownFacadeImpl<
      PromptTagMetaEntry,
      DataMartAdditionalParams
    >([this.promptHandler]);
  }

  async render(input: DataMartMarkdownTemplateInput): Promise<DataMartMarkdownTemplateOutput> {
    const baseInput: MarkdownTemplateToMarkdownInput<DataMartAdditionalParams> = {
      template: input.template,
      context: input.context,
      additionalParams: { ...input.params, wholeTemplate: input.template },
    };

    const { markdown, meta } = await this.base.render(baseInput);

    const tags = meta?.tags ?? [];

    const prompts: DataMartPromptMetaEntry[] = tags.map(tag => ({
      payload: tag.payload,
      meta: tag.resultMeta,
    }));

    return {
      markdown,
      prompts,
    };
  }
}
