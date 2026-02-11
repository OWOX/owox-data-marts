import { HelperOptions } from 'handlebars';
import { TagRenderedResult } from '../../types/render-template.types';
import { TagHandlerException } from '../tag-handler.exception';
import { TagHandler } from '../tag-handler.interface';

export interface DataTableHeader {
  name: string;
  alias?: string;
  description?: string;
}

export interface DataTablePayload {
  dataHeaders: DataTableHeader[];
  dataRows: unknown[][];
}

const DEFAULT_TABLE_ROWS = 10;
const MAX_TABLE_ROWS = 100;

type SliceFrom = 'start' | 'end';

/**
 * Tag handler for rendering data tables as Markdown.
 *
 * Supported hash parameters:
 *  - `dataHeaders` - array of column descriptors (fallback: context)
 *  - `dataRows` - 2D array of cell values (fallback: context)
 *  - `limit` - max rows to display (default: 10, cap: 100)
 *  - `from` - slice origin: "start" (default) or "end"
 *  - `columns` - comma-separated column names/aliases to include
 */
export class DataTableTagHandler implements TagHandler<DataTablePayload, TagRenderedResult<void>> {
  readonly tag = 'data-table' as const;
  readonly immediate = true as const;

  buildPayload(_args: unknown[], options: HelperOptions, context: unknown): DataTablePayload {
    const hash = (options.hash ?? {}) as Record<string, unknown>;
    const ctx = (context ?? {}) as Record<string, unknown>;

    const dataHeaders = this.resolveHeaders(hash, ctx);
    const dataRows = this.resolveRows(hash, ctx);
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

  private resolveHeaders(
    hash: Record<string, unknown>,
    ctx: Record<string, unknown>
  ): DataTableHeader[] {
    const value = hash['dataHeaders'] ?? ctx['dataHeaders'];
    if (!Array.isArray(value) || value.length === 0) {
      throw new TagHandlerException(`[${this.tag}] "dataHeaders" must be a non-empty array`);
    }
    return value as DataTableHeader[];
  }

  private resolveRows(hash: Record<string, unknown>, ctx: Record<string, unknown>): unknown[][] {
    const value = hash['dataRows'] ?? ctx['dataRows'];
    if (!Array.isArray(value)) {
      throw new TagHandlerException(`[${this.tag}] "dataRows" must be an array`);
    }
    return value as unknown[][];
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
