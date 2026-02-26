import { Injectable } from '@nestjs/common';
import { TagHandlerMetaAware, TagMeta } from './tag-handler-meta-aware.interface';
import { TableTagHandler } from '../../../common/template/handlers/base/table-tag.handler';
import { ValueTagHandler } from '../../../common/template/handlers/base/value-tag.handler';

@Injectable()
export class TemplateTagsService {
  private handlers: TagHandlerMetaAware[] = [];

  constructor(
    private readonly dataTableHandler: TableTagHandler,
    private readonly singleValueHandler: ValueTagHandler
  ) {
    this.registerHandler(this.dataTableHandler);
    this.registerHandler(this.singleValueHandler);
  }

  private registerHandler(handler: TagHandlerMetaAware) {
    this.handlers.push(handler);
  }

  getAllTagsMeta(): TagMeta[] {
    return this.handlers.map(h => h.tagMetaInfo());
  }
}
