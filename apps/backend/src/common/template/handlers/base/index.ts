export { TableTagHandler, DataTablePayload, DataTableHeader } from './table-tag.handler';
export { ValueTagHandler } from './value-tag.handler';

import { TagHandler } from '../tag-handler.interface';
import { TagRenderedResult } from '../../types/render-template.types';
import { TableTagHandler } from './table-tag.handler';
import { ValueTagHandler } from './value-tag.handler';

export function getBaseHandlers(): TagHandler<unknown, TagRenderedResult<unknown>>[] {
  return [new TableTagHandler(), new ValueTagHandler()];
}
