import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { ReportDataBatch } from '../dto/domain/report-data-batch.dto';
import { Report } from '../entities/report.entity';
import { DataDestination } from '../entities/data-destination.entity';
import { ReportExecutionPolicyResolver } from './report-execution-policy.resolver';

describe('ReportExecutionPolicyResolver', () => {
  const createReport = (destinationType: DataDestinationType): Report => {
    const report = new Report();
    const dataDestination = new DataDestination();
    dataDestination.type = destinationType;
    report.dataDestination = dataDestination;
    return report;
  };

  it('returns probe-limited policy for email-based destinations', () => {
    const resolver = new ReportExecutionPolicyResolver();
    const policy = resolver.resolve(createReport(DataDestinationType.EMAIL));

    expect(policy.canReadNextBatch()).toBe(true);
    expect(policy.getMaxDataRowsPerBatch()).toBe(101);

    const first = policy.mapReadBatch(
      new ReportDataBatch(
        Array.from({ length: 70 }, (_, i) => [i]),
        'b2'
      )
    );
    expect(first.dataRows).toHaveLength(70);
    expect(policy.getMaxDataRowsPerBatch()).toBe(31);
    expect(policy.shouldStopAfterBatch()).toBe(false);

    const second = policy.mapReadBatch(
      new ReportDataBatch(
        Array.from({ length: 70 }, (_, i) => [i + 70]),
        'b3'
      )
    );
    expect(second.dataRows).toHaveLength(30);
    expect(policy.shouldStopAfterBatch()).toBe(true);
    expect(policy.canReadNextBatch()).toBe(false);
    expect(policy.getStopReason()).toContain('row probe limit (101)');
  });

  it('returns unbounded policy for non-email destinations', () => {
    const resolver = new ReportExecutionPolicyResolver();
    const policy = resolver.resolve(createReport(DataDestinationType.GOOGLE_SHEETS));

    expect(policy.canReadNextBatch()).toBe(true);
    expect(policy.getMaxDataRowsPerBatch()).toBeUndefined();

    const input = new ReportDataBatch([[1], [2]], 'b2');
    const mapped = policy.mapReadBatch(input);
    expect(mapped).toBe(input);
    expect(policy.shouldStopAfterBatch()).toBe(false);
    expect(policy.getStopReason()).toBeNull();
  });
});
