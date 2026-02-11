export { DataTableTagHandler } from './data-table-tag.handler';

import { TagHandler } from '../tag-handler.interface';
import { TagRenderedResult } from '../../types/render-template.types';
import { DataTableTagHandler } from './data-table-tag.handler';

export function getBaseHandlers(): TagHandler<unknown, TagRenderedResult<unknown>>[] {
  return [new DataTableTagHandler()];
}
