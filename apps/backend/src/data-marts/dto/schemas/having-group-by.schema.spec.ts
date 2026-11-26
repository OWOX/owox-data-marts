import { HavingGroupBySchema } from './having-group-by.schema';

function messagesOf(value: unknown): string[] {
  const result = HavingGroupBySchema.safeParse(value);
  return result.success ? [] : result.error.issues.map(issue => issue.message);
}

describe('HavingGroupBySchema', () => {
  it('accepts a list of keys', () => {
    expect(HavingGroupBySchema.safeParse({ column: ['status'] }).success).toBe(true);
  });

  it('accepts an empty key list (one group: the total)', () => {
    expect(HavingGroupBySchema.safeParse({ column: [] }).success).toBe(true);
  });

  it('accepts a date bucket on a listed key', () => {
    const result = HavingGroupBySchema.safeParse({
      column: ['date'],
      dateTrunc: [{ column: 'date', unit: 'MONTH' }],
    });
    expect(result.success).toBe(true);
  });

  it('refuses an extra key', () => {
    expect(HavingGroupBySchema.safeParse({ column: ['status'], sort: [] }).success).toBe(false);
  });

  it('refuses a column that is not an array', () => {
    expect(HavingGroupBySchema.safeParse({ column: 'status' }).success).toBe(false);
  });

  it('refuses an empty string in column', () => {
    expect(HavingGroupBySchema.safeParse({ column: ['status', ''] }).success).toBe(false);
  });

  it('refuses a duplicate key and names it', () => {
    const messages = messagesOf({ column: ['status', 'date', 'status'] });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('"status"');
  });

  it('refuses a date bucket on a key that is not in column and names it', () => {
    const messages = messagesOf({
      column: ['status'],
      dateTrunc: [{ column: 'date', unit: 'MONTH' }],
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('"date"');
  });

  it('refuses two date buckets on one key', () => {
    const messages = messagesOf({
      column: ['date'],
      dateTrunc: [
        { column: 'date', unit: 'MONTH' },
        { column: 'date', unit: 'DAY' },
      ],
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('"date"');
  });
});
