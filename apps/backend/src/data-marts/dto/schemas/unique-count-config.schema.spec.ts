import { UniqueCountConfigSchema } from './unique-count-config.schema';

describe('UniqueCountConfigSchema', () => {
  it('accepts true', () => {
    const result = UniqueCountConfigSchema.safeParse(true);
    expect(result.success).toBe(true);
    expect(result.success && result.data).toBe(true);
  });

  it('accepts false', () => {
    const result = UniqueCountConfigSchema.safeParse(false);
    expect(result.success).toBe(true);
    expect(result.success && result.data).toBe(false);
  });

  it('accepts null', () => {
    const result = UniqueCountConfigSchema.safeParse(null);
    expect(result.success).toBe(true);
    expect(result.success && result.data).toBeNull();
  });

  it('rejects a non-boolean (string)', () => {
    const result = UniqueCountConfigSchema.safeParse('yes');
    expect(result.success).toBe(false);
  });

  it('rejects a non-boolean (number)', () => {
    const result = UniqueCountConfigSchema.safeParse(1);
    expect(result.success).toBe(false);
  });

  it('rejects an object', () => {
    const result = UniqueCountConfigSchema.safeParse({ enabled: true });
    expect(result.success).toBe(false);
  });
});
