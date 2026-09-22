import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';

const quoted = (columns: readonly string[]): string => columns.map(c => `"${c}"`).join(', ');

/**
 * A report selecting columns it can no longer be built from — told apart by WHY.
 *
 * Disconnected and hidden reach this point identically: every list built for reporting has
 * already dropped both, so the column is simply not there. They are not the same fact and do not
 * have the same fix. A disconnected column is gone from the source and someone has to restore the
 * schema; a hidden one is exactly where it was, and the analyst who hid it can show it again.
 * Telling a reader to "contact your analyst to restore the schema" over a column their analyst
 * deliberately hid sends them to repair something that is not broken.
 *
 * `unknownColumns` keeps carrying BOTH, in the caller's order: it is the machine-readable handle
 * every existing consumer keys off, and narrowing it would silently change what they see.
 */
export function throwDisconnectedReportColumnsError(
  dataMartId: string,
  unknownColumns: string[],
  hiddenColumnNames: ReadonlySet<string> = new Set()
): never {
  const uniqueUnknownColumns = Array.from(new Set(unknownColumns));
  const hidden = uniqueUnknownColumns.filter(column => hiddenColumnNames.has(column));
  const disconnected = uniqueUnknownColumns.filter(column => !hiddenColumnNames.has(column));

  const sentences: string[] = ['Cannot build report SQL.'];
  if (disconnected.length > 0) {
    sentences.push(
      `Disconnected columns: ${quoted(disconnected)}.`,
      'They are missing from the current Data Mart output schema.'
    );
  }
  if (hidden.length > 0) {
    sentences.push(
      `Hidden columns: ${quoted(hidden)}.`,
      'They are still in the Data Mart, but hidden from reporting.'
    );
  }
  sentences.push(
    'Uncheck them and remove any filter, sort, aggregation or date bucket rule that references them,',
    hidden.length > 0 && disconnected.length === 0
      ? 'or ask your analyst to show them in reports again.'
      : 'or contact your analyst to restore the schema.'
  );

  throw new BusinessViolationException(sentences.join(' '), {
    unknownColumns: uniqueUnknownColumns,
    ...(hidden.length > 0 ? { hiddenColumns: hidden } : {}),
    dataMartId,
  });
}
