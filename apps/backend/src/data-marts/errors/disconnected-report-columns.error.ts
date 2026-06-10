import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';

export function throwDisconnectedReportColumnsError(
  dataMartId: string,
  unknownColumns: string[]
): never {
  const uniqueUnknownColumns = Array.from(new Set(unknownColumns));
  const list = uniqueUnknownColumns.map(column => `"${column}"`).join(', ');

  throw new BusinessViolationException(
    `Cannot build report SQL, report references columns that are disconnected from the current ` +
      `data mart schema or joined data marts setup: ${list}. ` +
      `Update the report column selection, or restore the previous schema or joined data marts setup to reconnect them.`,
    { unknownColumns: uniqueUnknownColumns, dataMartId }
  );
}
