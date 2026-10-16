import { buildSegmentMarker } from './backfill-segment';
import { BackfillChainMeta } from '../../utils/manual-backfill-range';

jest.mock('@owox/connectors', () => ({ Core: { MAX_MANUAL_BACKFILL_DAYS: 31 } }));

const META: BackfillChainMeta = {
  id: 'chain-1',
  requestedStart: '2024-01-01',
  requestedEnd: '2025-06-30',
  segmentIndex: 3,
  segmentsTotal: 18,
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

  it('says a failed segment counted as one run when a configuration loaded data', () => {
    const marker = buildSegmentMarker(META, WINDOW, 'failed', AT, {
      loadedThrough: '2024-03-20',
      counted: true,
      chainContinues: true,
    });

    expect(marker.message).toBe(
      'Backfill 2024-01-01 – 2025-06-30: segment 3 of 18 (2024-03-03 – 2024-04-02) failed; days through 2024-03-20 were loaded — counted as 1 run'
    );
  });

  it('does not claim a run for a failed segment that loaded nothing', () => {
    const { message } = buildSegmentMarker(META, WINDOW, 'failed', AT, {
      counted: false,
      chainContinues: true,
    });

    expect(message).toContain('no days of this segment were loaded');
    expect(message).not.toContain('counted as 1 run');
  });

  it('qualifies the loaded days when only some configurations reported a checkpoint', () => {
    const { message } = buildSegmentMarker(META, WINDOW, 'failed', AT, {
      loadedThrough: '2024-03-20',
      configurationsLoaded: 2,
      configurationsTotal: 3,
      counted: true,
    });

    expect(message).toContain('days through 2024-03-20 were loaded (2 of 3 configurations)');
  });

  it('leaves the loaded days unqualified when every configuration reported', () => {
    const { message } = buildSegmentMarker(META, WINDOW, 'failed', AT, {
      loadedThrough: '2024-03-20',
      configurationsLoaded: 3,
      configurationsTotal: 3,
    });

    expect(message).toContain('days through 2024-03-20 were loaded');
    expect(message).not.toContain('configurations');
  });

  it('names the part of the period a restricted project left unloaded, this segment included', () => {
    const marker = buildSegmentMarker(META, WINDOW, 'failed', AT, {
      chainContinues: false,
      chainEnd: 'stopped',
    });

    expect(marker.message).toBe(
      'Backfill stopped: the project is restricted; segments 3–18 (2024-03-03 – 2025-06-30) were not loaded.'
    );
    expect(marker.tags).toMatchObject({
      phase: 'failed',
      chainContinues: false,
      chainEnd: 'stopped',
    });
  });

  it('uses the singular when the restricted segment is the last one', () => {
    const lastMeta = { ...META, segmentIndex: 18 };
    const lastWindow = { startDate: '2025-06-01', endDate: '2025-06-30' };

    expect(
      buildSegmentMarker(lastMeta, lastWindow, 'failed', AT, { chainEnd: 'stopped' }).message
    ).toBe(
      'Backfill stopped: the project is restricted; segment 18 (2025-06-01 – 2025-06-30) was not loaded.'
    );
  });

  it('marks the run the chain deliberately ended on', () => {
    const finished = buildSegmentMarker(META, WINDOW, 'completed', AT, {
      chainContinues: false,
      chainEnd: 'finished',
    });
    expect(finished.tags).toMatchObject({ chainContinues: false, chainEnd: 'finished' });
  });
});
