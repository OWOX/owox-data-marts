import 'reflect-metadata';
import { IsOptional, validate } from 'class-validator';
import { z } from 'zod';
import { IsZodValid } from './is-zod-valid.validator';

const BoolOrStringArraySchema = z.union([z.boolean(), z.array(z.string())]).nullable();

class Holder {
  @IsOptional()
  @IsZodValid(BoolOrStringArraySchema, {
    message: 'value must be true, false, null, or an array of strings',
  })
  value?: unknown;
}

async function validateHolder(value: unknown) {
  const holder = new Holder();
  (holder as unknown as { value: unknown }).value = value;
  return validate(holder);
}

describe('IsZodValid', () => {
  it('passes when the value is undefined (IsOptional short-circuits)', async () => {
    const errors = await validateHolder(undefined);
    expect(errors).toHaveLength(0);
  });

  it('passes when the value is null', async () => {
    const errors = await validateHolder(null);
    expect(errors).toHaveLength(0);
  });

  it('passes for true and false', async () => {
    expect(await validateHolder(true)).toHaveLength(0);
    expect(await validateHolder(false)).toHaveLength(0);
  });

  it('passes for an array of strings', async () => {
    const errors = await validateHolder(['orders', 'orders.items']);
    expect(errors).toHaveLength(0);
  });

  it('rejects a string scalar', async () => {
    const errors = await validateHolder('banana');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints?.isZodValid).toBe(
      'value must be true, false, null, or an array of strings'
    );
  });

  it('rejects an array containing a non-string element', async () => {
    const errors = await validateHolder(['orders', 42]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints?.isZodValid).toBe(
      'value must be true, false, null, or an array of strings'
    );
  });

  it('rejects a plain object', async () => {
    const errors = await validateHolder({ enabled: true });
    expect(errors.length).toBeGreaterThan(0);
  });
});
