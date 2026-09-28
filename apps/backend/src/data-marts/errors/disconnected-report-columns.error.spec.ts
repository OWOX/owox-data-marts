import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { throwDisconnectedReportColumnsError } from './disconnected-report-columns.error';

function caught(fn: () => never): BusinessViolationException {
  try {
    fn();
  } catch (error) {
    return error as BusinessViolationException;
  }
  throw new Error('expected the helper to throw');
}

describe('throwDisconnectedReportColumnsError', () => {
  it('sends the reader to restore the schema when the columns are genuinely gone', () => {
    const error = caught(() => throwDisconnectedReportColumnsError('dm-1', ['old_column']));

    expect(error.message).toBe(
      'Cannot build report SQL. Disconnected columns: "old_column". ' +
        'They are missing from the current Data Mart output schema. ' +
        'Uncheck them and remove any filter, sort, aggregation or date bucket rule that references them, ' +
        'or contact your analyst to restore the schema.'
    );
    expect(error.errorDetails).toEqual({ unknownColumns: ['old_column'], dataMartId: 'dm-1' });
  });

  it('says hidden, and offers the fix that actually applies, when the analyst hid the column', () => {
    // Nothing is broken here and no schema needs restoring: the column is where it always was,
    // and the person who hid it can show it again. The old wording sent the reader to repair a
    // schema their own analyst had deliberately changed.
    const error = caught(() =>
      throwDisconnectedReportColumnsError('dm-1', ['ROAS'], new Set(['ROAS']))
    );

    expect(error.message).toBe(
      'Cannot build report SQL. Hidden columns: "ROAS". ' +
        'They are still in the Data Mart, but hidden from reporting. ' +
        'Uncheck them and remove any filter, sort, aggregation or date bucket rule that references them, ' +
        'or ask your analyst to show them in reports again.'
    );
    expect(error.errorDetails).toEqual({
      unknownColumns: ['ROAS'],
      hiddenColumns: ['ROAS'],
      dataMartId: 'dm-1',
    });
  });

  it('names both groups when a report carries one of each, and keeps the schema advice', () => {
    const error = caught(() =>
      throwDisconnectedReportColumnsError('dm-1', ['old_column', 'ROAS'], new Set(['ROAS']))
    );

    expect(error.message).toContain('Disconnected columns: "old_column".');
    expect(error.message).toContain('Hidden columns: "ROAS".');
    // One of them really is missing, so the schema advice is the one that has to survive.
    expect(error.message).toContain('or contact your analyst to restore the schema.');
  });

  it('keeps unknownColumns carrying both kinds — it is what consumers key off', () => {
    const error = caught(() =>
      throwDisconnectedReportColumnsError('dm-1', ['ROAS', 'old_column', 'ROAS'], new Set(['ROAS']))
    );

    expect(error.errorDetails).toEqual({
      unknownColumns: ['ROAS', 'old_column'],
      hiddenColumns: ['ROAS'],
      dataMartId: 'dm-1',
    });
  });
});
