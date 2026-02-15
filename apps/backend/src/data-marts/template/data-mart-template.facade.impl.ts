import { Inject, Injectable } from '@nestjs/common';
import { TemplateRenderFacade } from '../../common/template/facades/template-render.facade';
import {
  TEMPLATE_RENDER_FACADE,
  TagMetaEntry,
} from '../../common/template/types/render-template.types';
import {
  DataMartTemplateFacade,
  DataMartTemplateInput,
  DataMartTemplateOutput,
} from './data-mart-template.facade';
import { InsightTemplateDataTableTagHandler } from './handlers/insight-template-data-table-tag.handler';

@Injectable()
export class DataMartTemplateFacadeImpl implements DataMartTemplateFacade {
  private readonly dataTableHandler = new InsightTemplateDataTableTagHandler();

  constructor(
    @Inject(TEMPLATE_RENDER_FACADE)
    private readonly templateRenderer: TemplateRenderFacade<TagMetaEntry>
  ) {}

  async render(input: DataMartTemplateInput): Promise<DataMartTemplateOutput> {
    const { rendered, meta } = await this.templateRenderer.render(
      {
        template: input.template,
        context: input.context,
      },
      [this.dataTableHandler],
      true
    );

    return {
      rendered,
      tags: meta?.tags ?? [],
    };
  }
}
