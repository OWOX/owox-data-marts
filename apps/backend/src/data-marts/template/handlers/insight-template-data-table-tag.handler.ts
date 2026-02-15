import { HelperOptions } from 'handlebars';
import {
  DataTablePayload,
  DataTableTagHandler,
} from '../../../common/template/handlers/base/data-table-tag.handler';
import { TagHandlerException } from '../../../common/template/handlers/tag-handler.exception';
import { TagHandler } from '../../../common/template/handlers/tag-handler.interface';
import { TagRenderedResult } from '../../../common/template/types/render-template.types';

interface TableSourceContext {
  dataHeaders?: DataTablePayload['dataHeaders'];
  dataRows?: DataTablePayload['dataRows'];
}

const DEFAULT_SOURCE_KEY = 'main';

export class InsightTemplateDataTableTagHandler implements TagHandler<
  DataTablePayload,
  TagRenderedResult<void>
> {
  readonly tag = 'table' as const;
  readonly immediate = true as const;

  // TODO temporary, align logic to one handler
  private readonly baseHandler = new DataTableTagHandler();

  buildPayload(args: unknown[], options: HelperOptions, context: unknown): DataTablePayload {
    const hash = (options.hash ?? {}) as Record<string, unknown>;
    const sourceRaw = hash['source'];

    if (sourceRaw != null && typeof sourceRaw !== 'string') {
      throw new TagHandlerException(`[${this.tag}] "source" must be a string`);
    }

    const source = (sourceRaw as string | undefined)?.trim() || DEFAULT_SOURCE_KEY;
    const tableSource = this.resolveSourceContext(context, source);

    const patchedHash: Record<string, unknown> = { ...hash };
    delete patchedHash['source'];

    if (tableSource) {
      if (patchedHash['dataHeaders'] === undefined) {
        patchedHash['dataHeaders'] = tableSource.dataHeaders;
      }
      if (patchedHash['dataRows'] === undefined) {
        patchedHash['dataRows'] = tableSource.dataRows;
      }

      const rows = tableSource.dataRows;
      if (Array.isArray(rows) && rows.length === 0) {
        return {
          dataHeaders: (tableSource.dataHeaders ?? []) as DataTablePayload['dataHeaders'],
          dataRows: [],
        };
      }
    } else if (sourceRaw != null) {
      throw new TagHandlerException(`[${this.tag}] source "${source}" is not configured`);
    }

    const patchedOptions = { ...options, hash: patchedHash } as HelperOptions;
    return this.baseHandler.buildPayload(args, patchedOptions, context);
  }

  handle(input: DataTablePayload): TagRenderedResult<void> {
    if (!input.dataRows.length) {
      return { rendered: '', meta: undefined as void };
    }

    if (!input.dataHeaders.length) {
      return { rendered: '', meta: undefined as void };
    }

    return this.baseHandler.handle(input);
  }

  private resolveSourceContext(context: unknown, source: string): TableSourceContext | null {
    const ctx = (context ?? {}) as Record<string, unknown>;
    const tableSources = (ctx['tableSources'] ?? {}) as Record<string, TableSourceContext>;

    return tableSources[source] ?? null;
  }
}
