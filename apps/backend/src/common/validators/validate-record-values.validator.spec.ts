import 'reflect-metadata';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, MinLength, ValidateNested, validate } from 'class-validator';
import { ValidateRecordValues } from './validate-record-values.validator';

class Entry {
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;

  @IsOptional()
  @IsIn(['A', 'B'])
  kind?: 'A' | 'B';
}

class Holder {
  @ValidateRecordValues(Entry)
  items?: Record<string, Entry>;
}

async function validateHolder(items: unknown) {
  const holder = new Holder();
  (holder as unknown as { items: unknown }).items = items;
  const errors = await validate(holder, { whitelist: true, forbidNonWhitelisted: true });
  return errors;
}

describe('ValidateRecordValues', () => {
  it('passes when the value is undefined', async () => {
    const errors = await validateHolder(undefined);
    expect(errors).toHaveLength(0);
  });

  it('passes when the value is null', async () => {
    const errors = await validateHolder(null);
    expect(errors).toHaveLength(0);
  });

  it('passes on an empty record', async () => {
    const errors = await validateHolder({});
    expect(errors).toHaveLength(0);
  });

  it('passes when every entry matches the target class', async () => {
    const errors = await validateHolder({
      a: { label: 'foo', kind: 'A' },
      b: { kind: 'B' },
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects when the value is not a plain object', async () => {
    const errors = await validateHolder(new Map([['a', { kind: 'A' }]]));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints?.validateRecordValues).toMatch(/plain object/);
  });

  it('rejects when an entry is not a plain object and names the failing key', async () => {
    const errors = await validateHolder({ a: 'not-an-object' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints?.validateRecordValues).toMatch(/"a"/);
  });

  it('rejects when an inner property is invalid and names the key and property', async () => {
    const errors = await validateHolder({ alpha: { kind: 'BOGUS' } });
    expect(errors.length).toBeGreaterThan(0);
    const message = errors[0].constraints?.validateRecordValues ?? '';
    expect(message).toMatch(/"alpha"/);
    expect(message).toMatch(/kind/);
  });

  it('rejects unknown inner properties (whitelist is enforced)', async () => {
    const errors = await validateHolder({ alpha: { kind: 'A', extraneous: 1 } });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints?.validateRecordValues).toMatch(/"alpha"/);
  });

  it('isolates failure summaries across concurrent holder instances', async () => {
    const [errA, errB] = await Promise.all([
      validateHolder({ a: { kind: 'BOGUS' } }),
      validateHolder({ b: { label: '' } }),
    ]);
    expect(errA[0].constraints?.validateRecordValues).toMatch(/"a"/);
    expect(errB[0].constraints?.validateRecordValues).toMatch(/"b"/);
  });

  it('isolates failure summaries across two @ValidateRecordValues on the same parent', async () => {
    class TwoBucketHolder {
      @ValidateRecordValues(Entry)
      primary?: Record<string, Entry>;

      @ValidateRecordValues(Entry)
      secondary?: Record<string, Entry>;
    }

    const holder = new TwoBucketHolder();
    (holder as unknown as { primary: unknown; secondary: unknown }).primary = {
      a: { kind: 'BOGUS' },
    };
    (holder as unknown as { primary: unknown; secondary: unknown }).secondary = {
      b: { label: '' },
    };
    const errors = await validate(holder, { whitelist: true, forbidNonWhitelisted: true });

    const primary = errors.find(e => e.property === 'primary');
    const secondary = errors.find(e => e.property === 'secondary');
    expect(primary?.constraints?.validateRecordValues).toMatch(/"a"/);
    expect(secondary?.constraints?.validateRecordValues).toMatch(/"b"/);
  });

  it('unwraps nested ValidationError children when constraints are on a child', async () => {
    class Inner {
      @IsString()
      @MinLength(3)
      code!: string;
    }

    class NestedEntry {
      @ValidateNested()
      @Type(() => Inner)
      inner!: Inner;
    }

    class NestedHolder {
      @ValidateRecordValues(NestedEntry)
      items?: Record<string, NestedEntry>;
    }

    const holder = new NestedHolder();
    (holder as unknown as { items: unknown }).items = { alpha: { inner: { code: 'ab' } } };
    const errors = await validate(holder, { whitelist: true, forbidNonWhitelisted: true });

    expect(errors.length).toBeGreaterThan(0);
    const message = errors[0].constraints?.validateRecordValues ?? '';
    expect(message).toMatch(/"alpha"/);
    expect(message).toMatch(/longer than or equal/i);
  });
});
