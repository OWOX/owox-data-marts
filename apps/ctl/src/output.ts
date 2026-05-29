export type OutputFormat = 'table' | 'json';

export type TableColumn<T extends Record<string, unknown>> = {
  key: keyof T & string;
  label: string;
  get?: (row: T) => string | number | boolean | null | undefined;
};

export type ColorOptions = {
  enabled: boolean;
};

const ANSI = {
  bold: ['\u001B[1m', '\u001B[22m'],
  dim: ['\u001B[2m', '\u001B[22m'],
  green: ['\u001B[32m', '\u001B[39m'],
  red: ['\u001B[31m', '\u001B[39m'],
  yellow: ['\u001B[33m', '\u001B[39m'],
} as const;

export function shouldUseColor(options: {
  format: OutputFormat;
  noColor?: boolean;
  stream?: NodeJS.WriteStream;
  env?: NodeJS.ProcessEnv;
}): boolean {
  if (options.format === 'json' || options.noColor || options.env?.NO_COLOR !== undefined) {
    return false;
  }

  return options.stream?.isTTY === true;
}

function colorize(text: string, code: keyof typeof ANSI, options: ColorOptions): string {
  if (!options.enabled) {
    return text;
  }

  const [open, close] = ANSI[code];
  return `${open}${text}${close}`;
}

export function colors(options: ColorOptions) {
  return {
    bold: (text: string) => colorize(text, 'bold', options),
    dim: (text: string) => colorize(text, 'dim', options),
    error: (text: string) => colorize(text, 'red', options),
    success: (text: string) => colorize(text, 'green', options),
    warning: (text: string) => colorize(text, 'yellow', options),
  };
}

export function renderJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value);
}

export function renderTable<T extends Record<string, unknown>>(
  rows: T[],
  columns: TableColumn<T>[]
): string {
  if (rows.length === 0) {
    return 'No results';
  }

  const renderedRows = rows.map(row =>
    columns.map(column => stringifyCell(column.get ? column.get(row) : row[column.key]))
  );
  const widths = columns.map((column, columnIndex) =>
    Math.max(column.label.length, ...renderedRows.map(row => row[columnIndex]?.length ?? 0))
  );
  const renderLine = (values: string[]) =>
    values.map((value, index) => value.padEnd(widths[index] ?? 0)).join('  ');

  return [
    renderLine(columns.map(column => column.label)),
    renderLine(widths.map(width => '-'.repeat(width))),
    ...renderedRows.map(row => renderLine(row)),
  ].join('\n');
}

export function renderKeyValues(
  values: Record<string, string | number | boolean>,
  options: ColorOptions = { enabled: false }
): string {
  const labelWidth = Math.max(...Object.keys(values).map(label => label.length));
  const palette = colors(options);

  return Object.entries(values)
    .map(([label, value]) => `${palette.bold(`${label}:`.padEnd(labelWidth + 1))} ${value}`)
    .join('\n');
}
