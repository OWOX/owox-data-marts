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
