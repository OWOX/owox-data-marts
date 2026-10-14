import { buildSegmentMarker } from './backfill-segment';
import { BackfillChainMeta } from '../../utils/manual-backfill-range';

jest.mock('@owox/connectors', () => ({ Core: { MAX_MANUAL_BACKFILL_DAYS: 31 } }));

const META: BackfillChainMeta = {
  id: 'chain-1',
  requestedStart: '2024-01-01',
  requestedEnd: '2025-06-30',
  segmentIndex: 3,
  segmentsTotal: 18,
  consecutiveFailures: 0,
};
const WINDOW = { startDate: '2024-03-03', endDate: '2024-04-02' };
const AT = '2026-01-01T00:00:00.000Z';

describe('buildSegmentMarker', () => {
  it('names the segment while it is loading', () => {
    expect(buildSegmentMarker(META, WINDOW, 'started', AT)).toMatchObject({
      metric: 'backfill_segment',
      value: 3,
      message:
        'Backfill 2024-01-01 – 2025-06-30: loading segment 3 of 18 (2024-03-03 – 2024-04-02)',
      tags: {
        phase: 'started',
        segmentStart: '2024-03-03',
        segmentEnd: '2024-04-02',
        backfillStart: '2024-01-01',
        backfillEnd: '2025-06-30',
        segmentsTotal: 18,
      },
    });
  });

  it('says a completed segment counted as one run and whether the chain goes on', () => {
    const marker = buildSegmentMarker(META, WINDOW, 'completed', AT, {
      loadedThrough: '2024-04-02',
      chainContinues: true,
    });

    expect(marker.message).toBe(
      'Backfill 2024-01-01 – 2025-06-30: segment 3 of 18 (2024-03-03 – 2024-04-02) completed — counted as 1 run'
    );
    expect(marker.tags).toMatchObject({
      phase: 'completed',
      loadedThrough: '2024-04-02',
      chainContinues: true,
    });
  });

  it('says what a failed segment loaded instead of claiming a run', () => {
    expect(
      buildSegmentMarker(META, WINDOW, 'failed', AT, {
        loadedThrough: '2024-03-20',
        chainContinues: true,
      }).message
    ).toBe(
      'Backfill 2024-01-01 – 2025-06-30: segment 3 of 18 (2024-03-03 – 2024-04-02) failed; days through 2024-03-20 were loaded'
    );
    expect(
      buildSegmentMarker(META, WINDOW, 'failed', AT, { chainContinues: true }).message
    ).toContain('no days of this segment were loaded');
  });

  it('marks the run the chain deliberately ended on', () => {
    const finished = buildSegmentMarker(META, WINDOW, 'completed', AT, {
      chainContinues: false,
      chainEnd: 'finished',
    });
    expect(finished.tags).toMatchObject({ chainContinues: false, chainEnd: 'finished' });

    const stopped = buildSegmentMarker({ ...META, consecutiveFailures: 2 }, WINDOW, 'failed', AT, {
      chainContinues: false,
      chainEnd: 'stopped',
    });
    expect(stopped.tags).toMatchObject({ chainEnd: 'stopped' });
    expect(stopped.message).toContain('stopped after 3 consecutive failed segments');
  });
});
