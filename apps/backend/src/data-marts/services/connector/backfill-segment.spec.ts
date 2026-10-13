import { buildSegmentMarker, summarizeBackfillSegment } from './backfill-segment';

jest.mock('@owox/connectors', () => ({ Core: { MAX_MANUAL_BACKFILL_DAYS: 31 } }));

const REQUESTED = { startDate: '2024-01-01', endDate: '2025-06-30' };
const window = (startDate: string, endDate: string) => ({ startDate, endDate });

describe('summarizeBackfillSegment', () => {
  it('covers the widest window any configuration was asked for', () => {
    const summary = summarizeBackfillSegment(
      [
        {
          window: window('2024-02-01', '2024-03-02'),
          loadedThrough: '2024-03-02',
          hasRemainingWork: true,
        },
        {
          window: window('2024-02-10', '2024-03-11'),
          loadedThrough: '2024-03-11',
          hasRemainingWork: true,
        },
      ],
      REQUESTED,
      31
    );

    expect(summary).toMatchObject({
      segmentStart: '2024-02-01',
      segmentEnd: '2024-03-11',
      segmentIndex: 2,
      segmentsTotal: 18,
      loadedThrough: '2024-03-02',
      hasRemainingWork: true,
    });
  });

  it('has nothing to report when no configuration was spawned', () => {
    expect(
      summarizeBackfillSegment(
        [{ loadedThrough: '2025-06-30', hasRemainingWork: false }],
        REQUESTED,
        31
      )
    ).toBeUndefined();
  });

  it('has no loaded-through day while any configuration has loaded none', () => {
    const summary = summarizeBackfillSegment(
      [
        {
          window: window('2024-01-01', '2024-01-31'),
          loadedThrough: '2024-01-31',
          hasRemainingWork: false,
        },
        { window: window('2024-01-01', '2024-01-31'), hasRemainingWork: false },
      ],
      REQUESTED,
      31
    );

    expect(summary?.loadedThrough).toBeUndefined();
    expect(summary?.hasRemainingWork).toBe(false);
  });
});

describe('buildSegmentMarker', () => {
  const summary = summarizeBackfillSegment(
    [
      {
        window: window('2024-03-03', '2024-04-02'),
        loadedThrough: '2024-03-20',
        hasRemainingWork: false,
      },
    ],
    REQUESTED,
    31
  )!;

  it('says a completed segment counted as one run', () => {
    expect(buildSegmentMarker(summary, 'completed', '2026-01-01T00:00:00.000Z')).toMatchObject({
      metric: 'backfill_segment',
      value: 3,
      message: 'Segment 3 of 18 (2024-03-03 – 2024-04-02) completed — counted as 1 run',
      tags: { phase: 'completed', segmentsTotal: 18, loadedThrough: '2024-03-20' },
    });
  });

  it('says what a failed segment loaded instead of claiming a run', () => {
    expect(buildSegmentMarker(summary, 'failed', '2026-01-01T00:00:00.000Z').message).toBe(
      'Segment 3 of 18 (2024-03-03 – 2024-04-02) failed; days through 2024-03-20 were loaded'
    );
    expect(
      buildSegmentMarker({ ...summary, loadedThrough: undefined }, 'failed', 'x').message
    ).toContain('no days of the backfill were loaded');
  });
});
