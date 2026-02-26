import { HelperOptions } from 'handlebars';
import { TagRenderedResult } from '../../types/render-template.types';
import { TagHandlerException } from '../tag-handler.exception';
import { TagHandler } from '../tag-handler.interface';
import { TagHandlerMetaAware, TagMeta } from '../tag-handler-meta-aware.interface';

export interface DataTableHeader {
  name: string;
  alias?: string;
  description?: string;
}

export interface DataTablePayload {
  dataHeaders: DataTableHeader[];
  dataRows: unknown[][];
}

interface TableSourceContext {
  dataHeaders?: DataTablePayload['dataHeaders'];
  dataRows?: DataTablePayload['dataRows'];
}

const DEFAULT_SOURCE_KEY = 'main';
const DEFAULT_TABLE_ROWS = 10;
const MAX_TABLE_ROWS = 100;

type SliceFrom = 'start' | 'end';

/**
 * Tag handler for rendering data tables as Markdown.
 *
 * Resolves data from `context.tableSources[source]` where `source`
 * is a hash parameter (defaults to 'main').
 *
 * Supported hash parameters:
 *  - `source`  - key in tableSources (default: 'main')
 *  - `limit`   - max rows to display (default: 10, cap: 100)
 *  - `from`    - slice origin: "start" (default) or "end"
 *  - `columns` - comma-separated column names/aliases to include
 */
export class TableTagHandler
  implements TagHandler<DataTablePayload, TagRenderedResult<void>>, TagHandlerMetaAware
{
  readonly tag = 'table' as const;
  readonly immediate = true as const;

  tagMetaInfo(): TagMeta {
    return {
      name: 'table',
      description: 'Inserts a data table for the specified source.',
      parameters: [
        {
          name: 'source',
          type: 'string',
          required: false,
          default: DEFAULT_SOURCE_KEY,
          description: `The source key of the data to display. Default is "${DEFAULT_SOURCE_KEY}".`,
        },
      ],
    };
  }

  buildPayload(_args: unknown[], options: HelperOptions, context: unknown): DataTablePayload {
    const hash = (options.hash ?? {}) as Record<string, unknown>;
    const sourceRaw = hash['source'];

    if (sourceRaw != null && typeof sourceRaw !== 'string') {
      throw new TagHandlerException(`[${this.tag}] "source" must be a string`);
    }

    const source = (sourceRaw as string | undefined)?.trim() || DEFAULT_SOURCE_KEY;
    const tableSource = this.resolveSourceContext(context, source);

    if (!tableSource) {
      throw new TagHandlerException(`[${this.tag}] source "${source}" is not configured`);
    }

    const dataHeaders = (tableSource.dataHeaders ?? []) as DataTableHeader[];
    const dataRows = (tableSource.dataRows ?? []) as unknown[][];

    const limit = Math.min((hash['limit'] as number) ?? DEFAULT_TABLE_ROWS, MAX_TABLE_ROWS);
    const from = this.resolveFrom(hash);
    const columns = hash['columns'] as string | undefined;

    const slicedRows = this.sliceRows(dataRows, limit, from);

    return columns
      ? this.filterColumns(dataHeaders, slicedRows, columns)
      : { dataHeaders, dataRows: slicedRows };
  }

  handle(input: DataTablePayload): TagRenderedResult<void> {
    const { dataHeaders, dataRows } = input;

    if (!dataRows.length || !dataHeaders.length) {
      return { rendered: '', meta: undefined as void };
    }

    const headerCells = dataHeaders.map(h => h.alias ?? h.name);
    const headerLine = `| ${headerCells.join(' | ')} |`;
    const separatorLine = `| ${dataHeaders.map(() => '---').join(' | ')} |`;
    const bodyLines = dataRows.map(row => {
      const cells = row.map(cell => (cell == null ? '' : String(cell).replaceAll('|', '\\|')));
      return `| ${cells.join(' | ')} |`;
    });

    const rendered = [headerLine, separatorLine, ...bodyLines].join('\n');

    return { rendered, meta: undefined as void };
  }

  private resolveSourceContext(context: unknown, source: string): TableSourceContext | null {
    const ctx = (context ?? {}) as Record<string, unknown>;
    const tableSources = (ctx['tableSources'] ?? {}) as Record<string, TableSourceContext>;

    return tableSources[source] ?? null;
  }

  private resolveFrom(hash: Record<string, unknown>): SliceFrom {
    const from = (hash['from'] as string) ?? 'start';
    if (from !== 'start' && from !== 'end') {
      throw new TagHandlerException(`[${this.tag}] "from" must be "start" or "end", got "${from}"`);
    }
    return from;
  }

  private sliceRows(rows: unknown[][], limit: number, from: SliceFrom): unknown[][] {
    return from === 'end' ? rows.slice(-limit) : rows.slice(0, limit);
  }

  private filterColumns(
    headers: DataTableHeader[],
    rows: unknown[][],
    columnsRaw: string
  ): DataTablePayload {
    const columnNames = columnsRaw
      .split(',')
      .map(c => c.trim())
      .filter(Boolean);

    const indices = columnNames.map(name => {
      const idx = headers.findIndex(h => h.name === name || h.alias === name);
      if (idx === -1) {
        throw new TagHandlerException(`[${this.tag}] column "${name}" not found in dataHeaders`);
      }
      return idx;
    });

    return {
      dataHeaders: indices.map(i => headers[i]),
      dataRows: rows.map(row => indices.map(i => (row as unknown[])[i])),
    };
  }
}
