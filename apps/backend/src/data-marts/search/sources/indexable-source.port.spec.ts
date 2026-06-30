import { nextPageCursor, toCursorTimestamp } from './indexable-source.port';

describe('indexable-source cursor helpers', () => {
  it('preserves millisecond precision in cursor timestamps', () => {
    const createdAt = new Date('2024-01-01T00:00:00.123Z');

    expect(toCursorTimestamp(createdAt)).toBe('2024-01-01 00:00:00.123');
    expect(nextPageCursor([{ id: 'dm-1', createdAt }], 1)).toEqual({
      createdAt: '2024-01-01 00:00:00.123',
      id: 'dm-1',
    });
  });

  it('uses sqlite default timestamp precision when milliseconds are zero', () => {
    const createdAt = new Date('2024-01-01T00:00:00.000Z');

    expect(toCursorTimestamp(createdAt)).toBe('2024-01-01 00:00:00');
  });
});
