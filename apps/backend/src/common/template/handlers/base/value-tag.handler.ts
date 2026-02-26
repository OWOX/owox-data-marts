import { HelperOptions } from 'handlebars';
import { wrapCautionBlock } from '../../../markdown/helpers/blockquote-alert-wrapper';
import { DataTableHeader } from './table-tag.handler';
import { TagHandler } from '../tag-handler.interface';
import { TagRenderedResult } from '../../types/render-template.types';

interface SingleValueSourceContext {
  dataHeaders?: DataTableHeader[];
  dataRows?: unknown[][];
}

interface SingleValueTagPayload {
  source: string;
  dataHeaders: DataTableHeader[];
  dataRows: unknown[][];
  path?: string;
  column?: string;
  row?: string;
  error?: string;
}

const DEFAULT_SOURCE_KEY = 'main';
const DEFAULT_ROW = '1';
const DEFAULT_COLUMN = '1';
const PATH_PATTERN = /^\.(?<column>[A-Za-z_][A-Za-z0-9_]*)(?:\[(?<row>\d+)\])?$/;

import { TagHandlerMetaAware, TagMeta } from '../tag-handler-meta-aware.interface';

export class ValueTagHandler
  implements TagHandler<SingleValueTagPayload, TagRenderedResult<void>>, TagHandlerMetaAware
{
  readonly tag = 'value' as const;
  readonly immediate = true as const;

  tagMetaInfo(): TagMeta {
    return {
      name: 'value',
      description: 'Inserts a single metric value from the specified source. Usually used inline.',
      parameters: [
        {
          name: 'source',
          type: 'string',
          required: true,
          description: `The source key of the data. Default is ${DEFAULT_SOURCE_KEY}`,
        },
        {
          name: 'path',
          type: 'string',
          required: false,
          description: 'Path to value, e.g. .revenue[1]. Mutually exclusive with row/column.',
        },
        {
          name: 'row',
          type: 'string | number',
          required: false,
          description: 'Row index (1-based). Default is 1.',
        },
        {
          name: 'column',
          type: 'string | number',
          required: false,
          description: 'Column name or index (1-based). Default is 1.',
        },
      ],
    };
  }

  buildPayload(_args: unknown[], options: HelperOptions, context: unknown): SingleValueTagPayload {
    const hash = (options.hash ?? {}) as Record<string, unknown>;
    const sourceRaw = hash['source'];
    if (sourceRaw != null && typeof sourceRaw !== 'string') {
      return this.buildErrorPayload(DEFAULT_SOURCE_KEY, '"source" must be a string');
    }

    const source = (sourceRaw as string | undefined)?.trim() || DEFAULT_SOURCE_KEY;
    const sourceContext = this.resolveSourceContext(context, source);
    if (!sourceContext) {
      return this.buildErrorPayload(source, `source "${source}" is not configured`);
    }

    const path = this.readStringHash(hash, 'path');
    const column = this.readStringHash(hash, 'column');
    const row = this.readStringHash(hash, 'row');

    if (path.error) {
      return this.buildErrorPayload(source, path.error, sourceContext);
    }
    if (column.error) {
      return this.buildErrorPayload(source, column.error, sourceContext);
    }
    if (row.error) {
      return this.buildErrorPayload(source, row.error, sourceContext);
    }

    if (path.value && (column.value || row.value)) {
      return this.buildErrorPayload(
        source,
        '"path" cannot be combined with "column" or "row"',
        sourceContext
      );
    }

    return {
      source,
      dataHeaders: sourceContext.dataHeaders ?? [],
      dataRows: sourceContext.dataRows ?? [],
      path: path.value ?? undefined,
      column: column.value ?? undefined,
      row: row.value ?? undefined,
    };
  }

  handle(input: SingleValueTagPayload): TagRenderedResult<void> {
    if (input.error) {
      return this.buildErrorResult(input.error);
    }

    if (!input.dataHeaders.length) {
      return this.buildErrorResult(`source "${input.source}" has no columns`);
    }

    if (!input.dataRows.length) {
      return this.buildErrorResult(`source "${input.source}" has no rows`);
    }

    if (input.path) {
      const resolvedByPath = this.resolveFromPath(input.path, input.dataHeaders, input.dataRows);
      if (!resolvedByPath.ok) {
        return this.buildErrorResult(resolvedByPath.error);
      }
      return { rendered: resolvedByPath.value, meta: undefined as void };
    }

    const rowRaw = input.row ?? DEFAULT_ROW;
    const rowNumber = this.parsePositiveNumber(rowRaw);
    if (rowNumber == null) {
      return this.buildErrorResult(`"row" must be a positive integer, got "${rowRaw}"`);
    }

    const rowIndex = rowNumber - 1;
    const row = input.dataRows[rowIndex];
    if (!row) {
      return this.buildErrorResult(`row "${rowNumber}" is out of range`);
    }

    const columnRaw = input.column ?? DEFAULT_COLUMN;
    const columnIndex = this.resolveColumnIndex(columnRaw, input.dataHeaders);
    if (!columnIndex.ok) {
      return this.buildErrorResult(columnIndex.error);
    }

    if (columnIndex.index >= row.length) {
      return this.buildErrorResult(`column "${columnRaw}" is out of range for row "${rowNumber}"`);
    }

    const value = row[columnIndex.index];
    return {
      rendered: value == null ? '' : String(value),
      meta: undefined as void,
    };
  }

  private resolveFromPath(
    path: string,
    dataHeaders: DataTableHeader[],
    dataRows: unknown[][]
  ): { ok: true; value: string } | { ok: false; error: string } {
    const match = path.match(PATH_PATTERN);
    if (!match?.groups?.column) {
      return {
        ok: false,
        error: '"path" must match ".columnName[row]" (row optional), for example: .revenue[1]',
      };
    }

    const columnName = match.groups.column;
    const rowRaw = match.groups.row ?? DEFAULT_ROW;
    const rowNumber = this.parsePositiveNumber(rowRaw);
    if (rowNumber == null) {
      return { ok: false, error: `"path" row index must be a positive integer, got "${rowRaw}"` };
    }

    const rowIndex = rowNumber - 1;
    const row = dataRows[rowIndex];
    if (!row) {
      return { ok: false, error: `row "${rowNumber}" is out of range` };
    }

    const columnIndex = this.resolveColumnIndex(columnName, dataHeaders);
    if (!columnIndex.ok) {
      return { ok: false, error: columnIndex.error };
    }

    if (columnIndex.index >= row.length) {
      return {
        ok: false,
        error: `column "${columnName}" is out of range for row "${rowNumber}"`,
      };
    }

    const value = row[columnIndex.index];
    return { ok: true, value: value == null ? '' : String(value) };
  }

  private resolveColumnIndex(
    columnRaw: string,
    dataHeaders: DataTableHeader[]
  ): { ok: true; index: number } | { ok: false; error: string } {
    const numeric = this.parsePositiveNumber(columnRaw);
    if (numeric != null) {
      const index = numeric - 1;
      if (index < 0 || index >= dataHeaders.length) {
        return { ok: false, error: `column "${numeric}" is out of range` };
      }
      return { ok: true, index };
    }

    const exactIndex = dataHeaders.findIndex(
      header => header.name === columnRaw || header.alias === columnRaw
    );
    if (exactIndex >= 0) {
      return { ok: true, index: exactIndex };
    }

    const lowered = columnRaw.toLowerCase();
    const caseInsensitiveIndex = dataHeaders.findIndex(
      header =>
        header.name.toLowerCase() === lowered ||
        (header.alias ? header.alias.toLowerCase() === lowered : false)
    );
    if (caseInsensitiveIndex >= 0) {
      return { ok: true, index: caseInsensitiveIndex };
    }

    return { ok: false, error: `column "${columnRaw}" not found` };
  }

  private parsePositiveNumber(raw: string): number | null {
    if (!/^\d+$/.test(raw)) {
      return null;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }

    return parsed;
  }

  private readStringHash(
    hash: Record<string, unknown>,
    key: 'path' | 'column' | 'row'
  ): { value?: string; error?: string } {
    const raw = hash[key];
    if (raw == null) {
      return {};
    }

    if (typeof raw === 'number') {
      return { value: String(raw).trim() };
    }

    if (typeof raw === 'string') {
      return { value: raw.trim() };
    }

    return { error: `"${key}" must be a string` };
  }

  private resolveSourceContext(context: unknown, source: string): SingleValueSourceContext | null {
    const ctx = (context ?? {}) as Record<string, unknown>;
    const tableSources = (ctx['tableSources'] ?? {}) as Record<string, SingleValueSourceContext>;

    return tableSources[source] ?? null;
  }

  private buildErrorPayload(
    source: string,
    message: string,
    sourceContext?: SingleValueSourceContext | null
  ): SingleValueTagPayload {
    return {
      source,
      dataHeaders: sourceContext?.dataHeaders ?? [],
      dataRows: sourceContext?.dataRows ?? [],
      error: message,
    };
  }

  private buildErrorResult(message: string): TagRenderedResult<void> {
    return {
      rendered: wrapCautionBlock(`[${this.tag}] ${message}`),
      meta: undefined as void,
    };
  }
}
