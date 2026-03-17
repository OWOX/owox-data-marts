import { HelperOptions } from 'handlebars';
import { TagRenderedResult } from '../../types/render-template.types';
import { TagHandlerException } from '../tag-handler.exception';
import { DEFAULT_SOURCE_KEY, TagHandler } from '../tag-handler.interface';
import { TagHandlerMetaAware, TagMeta } from '../tag-handler-meta-aware.interface';
import {
  TABLE_TRUNCATION_NOTICE_MARKER,
  TABLE_TRUNCATION_NOTICE_TEMPLATE,
} from '../../constants/table-truncation-notice.constants';

export interface DataTableHeader {
  name: string;
  alias?: string;
  description?: string;
}

export interface DataTablePayload {
  dataHeaders: DataTableHeader[];
  dataRows: unknown[][];
  hasMoreRowsThanLimit?: boolean;
  rowsLimit?: number;
}

interface TableSourceContext {
  dataHeaders?: DataTablePayload['dataHeaders'];
  dataRows?: DataTablePayload['dataRows'];
  hasMoreRowsThanLimit?: boolean;
  rowsLimit?: number;
}

const DEFAULT_TABLE_ROWS = 100;
const MAX_TABLE_ROWS = 200;

/**
 * Tag handler for rendering data tables as Markdown.
 *
 * Resolves data from `context.tableSources[source]` where `source`
 * is a hash parameter (defaults to 'main').
 *
 * Supported hash parameters:
 *  - `source`  - key in tableSources (default: 'main')
 *  - `limit`   - max rows to display (default: 100, cap: 100)
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
      description:
        'Inserts a multi-row data table for the specified source. Use for breakdowns, rankings, and timelines.',
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
    const columns = hash['columns'] as string | undefined;

    const slicedRows = this.sliceRows(dataRows, limit);
    const payload = columns
      ? this.filterColumns(dataHeaders, slicedRows, columns)
      : { dataHeaders, dataRows: slicedRows };

    const hasMoreRowsThanLimit = tableSource.hasMoreRowsThanLimit === true;
    const rowsLimit = tableSource.rowsLimit ?? DEFAULT_TABLE_ROWS;

    return {
      ...payload,
      hasMoreRowsThanLimit,
      rowsLimit,
    };
  }

  handle(input: DataTablePayload): TagRenderedResult<void> {
    const {
      dataHeaders,
      dataRows,
      hasMoreRowsThanLimit = false,
      rowsLimit = DEFAULT_TABLE_ROWS,
    } = input;

    if (!dataRows.length || !dataHeaders.length) {
      return { rendered: '', meta: undefined as void };
    }
    const rowsToRender = hasMoreRowsThanLimit
      ? this.appendTruncationNoticeRow(dataHeaders.length, dataRows, rowsLimit)
      : dataRows;

    const headerCells = dataHeaders.map(h => h.alias || h.name);
    const headerLine = `| ${headerCells.join(' | ')} |`;
    const separatorLine = `| ${dataHeaders.map(() => '---').join(' | ')} |`;
    const bodyLines = rowsToRender.map(row => {
      const cells = dataHeaders.map((_, index) =>
        this.formatMarkdownCell((row as unknown[])[index] ?? null)
      );
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

  private sliceRows(rows: unknown[][], limit: number): unknown[][] {
    return rows.slice(0, limit);
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

  private appendTruncationNoticeRow(
    dataHeadersCount: number,
    dataRows: unknown[][],
    rowsLimit: number
  ): unknown[][] {
    const noticeText = TABLE_TRUNCATION_NOTICE_TEMPLATE.replace('{limit}', String(rowsLimit));
    const noticeRow: unknown[] = [
      `${TABLE_TRUNCATION_NOTICE_MARKER}${noticeText}`,
      ...Array.from({ length: Math.max(dataHeadersCount - 1, 0) }, () => ''),
    ];
    return [...dataRows, noticeRow];
  }

  private formatMarkdownCell(cell: unknown): string {
    return this.formatTextCell(cell).replaceAll('|', '\\|');
  }

  private formatTextCell(cell: unknown): string {
    return cell == null ? '' : String(cell);
  }
}
