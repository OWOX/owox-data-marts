import { runInNewContext } from 'node:vm';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { Report } from '../entities/report.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { ReportRunStatus } from '../enums/report-run-status.enum';
import { ReportRun } from './report-run.model';

describe('ReportRun.markAsUnsuccessful', () => {
  const newRun = () => ReportRun.create({} as Report, { errors: [] } as unknown as DataMartRun);

  it('stores the message of an error created in another realm, as native drivers throw them', () => {
    const run = newRun();
    const foreignError = runInNewContext('new Error("Table with name holidays does not exist")');
    expect(foreignError instanceof Error).toBe(false);

    run.markAsUnsuccessful(foreignError);

    expect(run.getReport().lastRunError).toBe('Table with name holidays does not exist');
    expect(run.getReport().lastRunStatus).toBe(ReportRunStatus.ERROR);
    expect(run.getDataMartRun().status).toBe(DataMartRunStatus.FAILED);
    expect(JSON.parse(run.getDataMartRun().errors![0]).error).toBe(
      'Table with name holidays does not exist'
    );
  });

  it('stores a string error as is', () => {
    const run = newRun();

    run.markAsUnsuccessful('Destination refused the rows');

    expect(run.getReport().lastRunError).toBe('Destination refused the rows');
  });
});
