import { TagMetaEntry } from '../../common/template/types/render-template.types';

export interface DataMartTemplateInput {
  template: string;
  context?: Record<string, unknown>;
}

export interface DataMartTemplateOutput {
  rendered: string;
  tags: TagMetaEntry[];
}

export interface DataMartTemplateFacade {
  render(input: DataMartTemplateInput): Promise<DataMartTemplateOutput>;
}
