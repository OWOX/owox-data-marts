import {
  hasOutputControls,
  ReportLike,
  usesSuffixedJoinedFieldNames,
} from './report-like-read-plan';
import { DataMart } from '../../entities/data-mart.entity';
import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';
import { Report } from '../../entities/report.entity';

const basePlan = {
  dataMart: {} as DataMart,
};

describe('hasOutputControls', () => {
  it('returns false when no output controls are set', () => {
    expect(hasOutputControls({ ...basePlan })).toBe(false);
  });

  it('returns true when filterConfig is non-empty', () => {
    expect(
      hasOutputControls({
        ...basePlan,
        filterConfig: [{ column: 'c', operator: 'eq', value: 1 }],
      })
    ).toBe(true);
  });

  it('returns true when sortConfig is non-empty', () => {
    expect(
      hasOutputControls({ ...basePlan, sortConfig: [{ column: 'c', direction: 'asc' }] })
    ).toBe(true);
  });

  it('returns true when aggregationConfig is non-empty', () => {
    expect(
      hasOutputControls({ ...basePlan, aggregationConfig: [{ column: 'c', function: 'SUM' }] })
    ).toBe(true);
  });

  it('returns true when dateTruncConfig is non-empty', () => {
    expect(
      hasOutputControls({ ...basePlan, dateTruncConfig: [{ column: 'date', unit: 'MONTH' }] })
    ).toBe(true);
  });

  it('returns true when limitConfig is set', () => {
    expect(hasOutputControls({ ...basePlan, limitConfig: 100 })).toBe(true);
  });

  it('returns true when uniqueCountConfig === true', () => {
    expect(hasOutputControls({ ...basePlan, uniqueCountConfig: true })).toBe(true);
  });

  it('returns false when uniqueCountConfig === null', () => {
    expect(hasOutputControls({ ...basePlan, uniqueCountConfig: null })).toBe(false);
  });

  it('returns false when uniqueCountConfig === false', () => {
    expect(hasOutputControls({ ...basePlan, uniqueCountConfig: false })).toBe(false);
  });

  it('returns true when uniqueCountConfig is a non-empty array (joined-only, no main)', () => {
    expect(hasOutputControls({ ...basePlan, uniqueCountConfig: ['orders'] })).toBe(true);
  });

  it('returns false when uniqueCountConfig is an empty array', () => {
    expect(hasOutputControls({ ...basePlan, uniqueCountConfig: [] })).toBe(false);
  });

  // A calculated field has no warehouse column: selecting one must flip a plan to the
  // output-controls path even with no filter/sort/aggregation/dateTrunc/limit/uniqueCount set —
  // otherwise RunReportService, ReportDataCacheService and StreamHttpDataService never call
  // ReportSqlComposerService.compose for a metric-only report, and their reader falls back to a
  // bare buildQuery(definition, { columns }) call that emits the metric's name as a plain,
  // nonexistent column. `basePlan.dataMart` carries no schema, so every OTHER case in this
  // describe block would stay green even if `hasSelectedCalculatedField` were deleted entirely —
  // these cases are the only ones that actually exercise it.
  describe('a selected calculated field', () => {
    const dataMartWithCtr = {
      schema: {
        fields: [
          { name: 'clicks', type: 'INTEGER', status: 'CONNECTED' },
          {
            name: 'ctr',
            type: 'FLOAT',
            status: 'CONNECTED',
            calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
          },
        ],
      },
    } as unknown as DataMart;

    it('returns true when columnConfig selects the metric and nothing else is set', () => {
      expect(
        hasOutputControls({ dataMart: dataMartWithCtr, columnConfig: ['clicks', 'ctr'] })
      ).toBe(true);
    });

    it('returns false when the metric exists on the schema but is not selected', () => {
      expect(hasOutputControls({ dataMart: dataMartWithCtr, columnConfig: ['clicks'] })).toBe(
        false
      );
    });

    it('returns false when columnConfig is absent, even though the schema has a calculated field', () => {
      expect(hasOutputControls({ dataMart: dataMartWithCtr })).toBe(false);
    });

    it('returns false for a plain field selection on a Data Mart with no calculated fields', () => {
      expect(hasOutputControls({ ...basePlan, columnConfig: ['clicks'] })).toBe(false);
    });
  });
});

describe('usesSuffixedJoinedFieldNames', () => {
  const reportWithDestination = (dataDestination: unknown): ReportLike =>
    ({ ...basePlan, dataDestination }) as unknown as Report;

  it('is enabled for a report writing to Google Sheets', () => {
    expect(
      usesSuffixedJoinedFieldNames(
        reportWithDestination({ type: DataDestinationType.GOOGLE_SHEETS })
      )
    ).toBe(true);
  });

  it('is enabled for a report writing to Excel', () => {
    // Same ground as Google Sheets: the label lands in a header cell the reader cannot widen for
    // one column alone.
    expect(
      usesSuffixedJoinedFieldNames(reportWithDestination({ type: DataDestinationType.EXCEL }))
    ).toBe(true);
  });

  it('is disabled for a report writing to any other destination', () => {
    expect(
      usesSuffixedJoinedFieldNames(
        reportWithDestination({ type: DataDestinationType.LOOKER_STUDIO })
      )
    ).toBe(false);
  });

  it('is disabled for a read plan, which carries no destination', () => {
    // The totals query, the HTTP data endpoint and MCP all build one of these.
    expect(usesSuffixedJoinedFieldNames({ ...basePlan })).toBe(false);
  });

  // A DataDestination is soft-deletable, and TypeORM's eager join silently drops a soft-deleted
  // row — leaving the property present on the entity but holding undefined (the same trap
  // BlendableSchemaService guards against for targetDataMart). `'x' in obj` is true in that case,
  // so reading `.type` straight through it would throw and take down paths that never needed the
  // destination at all, such as the generated-SQL preview.
  it.each([
    ['undefined', undefined],
    ['null', null],
  ])('does not throw when the destination relation resolved to %s', (_label, dataDestination) => {
    const report = reportWithDestination(dataDestination);

    expect(() => usesSuffixedJoinedFieldNames(report)).not.toThrow();
    expect(usesSuffixedJoinedFieldNames(report)).toBe(false);
  });
});
