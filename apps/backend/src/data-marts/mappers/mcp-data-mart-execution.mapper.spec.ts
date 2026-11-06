import { McpDataMartExecutionMapper } from './mcp-data-mart-execution.mapper';
import { DataMartRunDto } from '../dto/domain/data-mart-run.dto';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { BACKFILL_CHAIN_KEY, planBackfillChain } from '../utils/manual-backfill-range';

const mapper = new McpDataMartExecutionMapper();
const planned = planBackfillChain(
  { runType: 'MANUAL_BACKFILL', data: { StartDate: '2026-01-01', EndDate: '2026-03-31' } },
  'chain-1'
)!;
function run(status: DataMartRunStatus, segmentIndex = 1): DataMartRunDto {
  return {
    id: `run-${segmentIndex}`,
    dataMartId: 'dm',
    status,
    type: 'CONNECTOR',
    runType: 'manual',
    createdAt: new Date('2026-01-01'),
    startedAt: null,
    finishedAt: null,
    additionalParams: {
      [BACKFILL_CHAIN_KEY]: { ...planned.meta, segmentIndex, secret: 'private-chain-value' },
      payload: { token: 'private-payload-value' },
      backfillProgress: { cfg: '2026-01-31' },
    },
  } as unknown as DataMartRunDto;
}
describe('McpDataMartExecutionMapper backfill status', () => {
  it('returns a known failure reason without the rest of the raw run log', () => {
    const mapped = mapper.toRun({
      ...run(DataMartRunStatus.FAILED),
      errors: [
        'The run was not started because the maximum number of concurrent runs for this project was reached. Please wait for the current runs to finish and try again.',
        JSON.stringify({ type: 'error', error: 'provider password=secret', token: 'secret' }),
      ],
    });
    expect(mapped.errorSummary).toMatch(/maximum number of concurrent runs/);
    expect(mapped.errorSummary).toMatch(/Run History/);
    expect(JSON.stringify(mapped)).not.toContain('secret');
  });
  it('returns web guidance for unknown provider failures and failures without logs', () => {
    for (const errors of [null, [], ['password=secret'.repeat(1000)]]) {
      const mapped = mapper.toRun({ ...run(DataMartRunStatus.FAILED), errors });
      expect(mapped.errorSummary).toMatch(/failed.*Run History/);
      expect(mapped.errorSummary!.length).toBeLessThanOrEqual(1000);
      expect(JSON.stringify(mapped)).not.toContain('secret');
    }
  });
  it('returns null when a run has no failure to summarize', () => {
    expect(
      mapper.toRun({ ...run(DataMartRunStatus.SUCCESS), errors: null }).errorSummary
    ).toBeNull();
  });
  it('preserves safe correlation for a real multi-segment backfill after segment one succeeds', () => {
    expect(planned.meta.segmentsTotal).toBeGreaterThan(1);
    const mapped = mapper.toRun(run(DataMartRunStatus.SUCCESS));
    expect(mapped).toMatchObject({
      runId: 'run-1',
      status: 'SUCCESS',
      shouldPoll: false,
      backfill: { chainId: 'chain-1', segmentIndex: 1, segmentsTotal: planned.meta.segmentsTotal },
    });
    expect(JSON.stringify(mapped)).not.toContain('private-');
    expect(mapped.backfill).toEqual({
      chainId: 'chain-1',
      segmentIndex: 1,
      segmentsTotal: planned.meta.segmentsTotal,
    });
  });
  it('lets callers follow a later active segment by the same chain ID', () => {
    const first = mapper.toRun(run(DataMartRunStatus.SUCCESS));
    const next = mapper.toRun(run(DataMartRunStatus.RUNNING, 2));
    expect(next).toMatchObject({
      runId: 'run-2',
      shouldPoll: true,
      backfill: {
        chainId: first.backfill?.chainId,
        segmentIndex: 2,
        segmentsTotal: planned.meta.segmentsTotal,
      },
    });
  });
  it('preserves failed segment status even when later segments complete', () => {
    expect(mapper.toRun(run(DataMartRunStatus.FAILED)).status).toBe('FAILED');
    expect(mapper.toRun(run(DataMartRunStatus.SUCCESS, planned.meta.segmentsTotal))).toMatchObject({
      status: 'SUCCESS',
      shouldPoll: false,
      backfill: { segmentIndex: planned.meta.segmentsTotal },
    });
  });
  it('omits malformed or absent chain metadata without exposing the raw bag', () => {
    for (const additionalParams of [
      null,
      { [BACKFILL_CHAIN_KEY]: { id: 'chain', segmentIndex: 'secret' } },
    ]) {
      const mapped = mapper.toRun({ ...run(DataMartRunStatus.SUCCESS), additionalParams });
      expect(mapped.backfill).toBeUndefined();
      expect(JSON.stringify(mapped)).not.toContain('secret');
    }
  });
});
