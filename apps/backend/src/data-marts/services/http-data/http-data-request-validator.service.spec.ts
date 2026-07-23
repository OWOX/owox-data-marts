import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { HttpDataRequestValidator } from './http-data-request-validator.service';

describe('HttpDataRequestValidator', () => {
  const validator = new HttpDataRequestValidator();

  it('parses a single string column into an explicit selector', () => {
    const result = validator.validate({ column: 'date' });
    expect(result.columnSelector).toEqual({ mode: 'explicit', explicit: ['date'] });
  });

  it('preserves repeated column order in an explicit selector', () => {
    const result = validator.validate({ column: ['date', 'Revenue Total', 'user_id'] });
    expect(result.columnSelector).toEqual({
      mode: 'explicit',
      explicit: ['date', 'Revenue Total', 'user_id'],
    });
  });

  it('treats a missing column param as all-native', () => {
    const result = validator.validate({});
    expect(result.columnSelector).toEqual({ mode: 'allNative', explicit: [] });
  });

  it('treats columns="*" as all-native', () => {
    const result = validator.validate({ columns: '*' });
    expect(result.columnSelector).toEqual({ mode: 'allNative', explicit: [] });
  });

  it('keeps exact columns alongside columns="*" as all-native additions', () => {
    const result = validator.validate({ columns: '*', column: ['*', 'orders__revenue'] });
    expect(result.columnSelector).toEqual({
      mode: 'allNative',
      explicit: ['*', 'orders__revenue'],
    });
  });

  it('treats column="*" and column="**" as exact column names', () => {
    const result = validator.validate({ column: ['*', '**'] });
    expect(result.columnSelector).toEqual({ mode: 'explicit', explicit: ['*', '**'] });
  });

  it('treats columns="**" as all-blendable', () => {
    expect(validator.validate({ columns: '**' }).columnSelector).toEqual({ mode: 'allBlendable' });
  });

  it('rejects columns="**" combined with exact column values', () => {
    expect(() => validator.validate({ columns: '**', column: 'date' })).toThrow(
      BusinessViolationException
    );
  });

  it('rejects empty column value', () => {
    expect(() => validator.validate({ column: ['date', ''] })).toThrow(BusinessViolationException);
  });

  it('rejects repeated columns selector values', () => {
    expect(() => validator.validate({ columns: ['*', '**'] })).toThrow(BusinessViolationException);
  });

  it('rejects forbidden pagination params', () => {
    expect(() => validator.validate({ column: 'date', pageToken: 'abc' })).toThrow(
      BusinessViolationException
    );
    expect(() => validator.validate({ column: 'date', offset: '10' })).toThrow(
      BusinessViolationException
    );
  });

  it('parses limit from string', () => {
    const result = validator.validate({ column: 'date', limit: '50' });
    expect(result.limit).toBe(50);
  });

  it('rejects non-integer or non-positive limit', () => {
    expect(() => validator.validate({ column: 'date', limit: '0' })).toThrow(
      BusinessViolationException
    );
    expect(() => validator.validate({ column: 'date', limit: 'abc' })).toThrow(
      BusinessViolationException
    );
  });

  it('decodes base64url filter and validates against FilterConfigSchema', () => {
    const filter = [
      { column: 'date', operator: 'gte', value: '2026-01-01', placement: 'post-join' },
    ];
    const encoded = Buffer.from(JSON.stringify(filter), 'utf-8').toString('base64url');
    const result = validator.validate({ column: 'date', filter: encoded });
    expect(result.filter).toEqual(filter);
  });

  it('round-trips a filter whose standard base64 would contain + or / via the URL-safe alphabet', () => {
    const filter = [{ column: 'date', operator: 'gte', value: '2026-0-aa>?>?' }];
    const standard = Buffer.from(JSON.stringify(filter), 'utf-8').toString('base64');
    expect(standard).toMatch(/[+/]/);
    const urlSafe = Buffer.from(JSON.stringify(filter), 'utf-8').toString('base64url');
    expect(urlSafe).not.toMatch(/[+/=]/);
    const result = validator.validate({ column: 'date', filter: urlSafe });
    expect(result.filter).toEqual(filter);
  });

  it('rejects invalid base64url filter', () => {
    expect(() => validator.validate({ column: 'date', filter: 'not valid json @#$' })).toThrow(
      BusinessViolationException
    );
  });

  it('rejects malformed filter payload', () => {
    const badPayload = Buffer.from(JSON.stringify([{ totally: 'wrong' }]), 'utf-8').toString(
      'base64url'
    );
    expect(() => validator.validate({ column: 'date', filter: badPayload })).toThrow(
      BusinessViolationException
    );
  });

  describe('validateReportQuery', () => {
    it('parses limit from string', () => {
      const result = validator.validateReportQuery({ limit: '5' });
      expect(result).toEqual({ limit: 5 });
    });

    it('returns an empty result when no limit is provided', () => {
      const result = validator.validateReportQuery({});
      expect(result).toEqual({});
    });

    it('rejects unsupported query params', () => {
      expect(() => validator.validateReportQuery({ filter: 'x' })).toThrow(
        BusinessViolationException
      );
    });

    it('rejects non-integer or non-positive limit', () => {
      expect(() => validator.validateReportQuery({ limit: '0' })).toThrow(
        BusinessViolationException
      );
    });
  });
});
