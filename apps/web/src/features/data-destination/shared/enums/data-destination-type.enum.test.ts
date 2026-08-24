import { describe, expect, it } from 'vitest';
import {
  canCreateReportInApp,
  DataDestinationType,
  isPullBasedDestinationType,
  REPORT_DESTINATION_TYPES,
  SCHEDULABLE_REPORT_DESTINATION_TYPES,
} from './data-destination-type.enum';

describe('canCreateReportInApp', () => {
  it('is false only for Excel, whose reports the add-in creates', () => {
    const notCreatableHere = Object.values(DataDestinationType).filter(
      type => !canCreateReportInApp(type)
    );

    expect(notCreatableHere).toEqual([DataDestinationType.EXCEL]);
  });

  it('stays true for Data Studio, which is pulled but still set up here', () => {
    expect(canCreateReportInApp(DataDestinationType.LOOKER_STUDIO)).toBe(true);
  });
});

describe('SCHEDULABLE_REPORT_DESTINATION_TYPES', () => {
  it('is the report destinations minus the ones nobody can run', () => {
    // Derived rather than written out: a second hand-kept list is what let Excel be added to
    // one place and forgotten in the other.
    expect(SCHEDULABLE_REPORT_DESTINATION_TYPES).toEqual(
      REPORT_DESTINATION_TYPES.filter(type => !isPullBasedDestinationType(type))
    );
    expect(SCHEDULABLE_REPORT_DESTINATION_TYPES).not.toContain(DataDestinationType.EXCEL);
    expect(SCHEDULABLE_REPORT_DESTINATION_TYPES).toContain(DataDestinationType.GOOGLE_SHEETS);
  });
});
