import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';

export function throwDisconnectedReportColumnsError(
  dataMartId: string,
  unknownColumns: string[]
): never {
  const uniqueUnknownColumns = Array.from(new Set(unknownColumns));
  const list = uniqueUnknownColumns.map(column => `"${column}"`).join(', ');

  throw new BusinessViolationException(
    `Cannot build report SQL. Disconnected columns: ${list}. ` +
      `They are missing from the current Data Mart output schema. ` +
      `Uncheck them and remove any filter, sort, aggregation or date bucket rule that references them, ` +
      `or contact your analyst to restore the schema.`,
    { unknownColumns: uniqueUnknownColumns, dataMartId }
  );
}
