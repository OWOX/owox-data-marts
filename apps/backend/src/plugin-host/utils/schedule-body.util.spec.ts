import { BadRequestException } from '@nestjs/common';
import { parseCreateScheduleBody, parseUpdateScheduleBody } from './schedule-body.util';

const BASE = { action: 'sync', cron: '0 9 * * *', timeZone: 'UTC' };

function refusal(parse: () => unknown): unknown {
  try {
    parse();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).getResponse();
  }
  throw new Error('The body was accepted');
}

describe('parseCreateScheduleBody', () => {
  it('defaults enabled to true and name to null, and leaves absent parameters undefined', () => {
    expect(parseCreateScheduleBody(BASE)).toEqual({
      draft: { ...BASE, parameters: undefined, name: null },
      enabled: true,
    });
  });

  it('reads enabled, name and parameters', () => {
    expect(
      parseCreateScheduleBody({ ...BASE, enabled: false, name: 'Nightly', parameters: [1] })
    ).toEqual({ draft: { ...BASE, parameters: [1], name: 'Nightly' }, enabled: false });
  });

  it.each([
    ['a padded name', '  Nightly  ', 'Nightly'],
    ['an empty name', '', null],
    ['a blank name', ' \t\n ', null],
    // The 200-character check that follows sees the trimmed name.
    ['200 characters padded with spaces', ` ${'n'.repeat(200)} `, 'n'.repeat(200)],
  ])('trims %s, storing an empty result as null', (_label, name, stored) => {
    expect(parseCreateScheduleBody({ ...BASE, name }).draft.name).toBe(stored);
  });

  it('keeps prototype keys in parameters as sent', () => {
    const parameters = '{"__proto__":{"x":1},"constructor":2,"nested":{"prototype":3}}';
    const body = JSON.parse(
      `{"action":"sync","cron":"0 9 * * *","timeZone":"UTC","parameters":${parameters}}`
    );

    expect(JSON.stringify(parseCreateScheduleBody(body).draft.parameters)).toBe(parameters);
  });

  it.each([
    [{ ...BASE, extra: 1 }, 'property extra should not exist'],
    [{ ...BASE, enabled: 'yes' }, 'enabled: Expected boolean, received string'],
    [{ ...BASE, cron: 5 }, 'cron: Expected string, received number'],
    [{ cron: '0 9 * * *', timeZone: 'UTC' }, 'action: Required'],
    [[], 'body: Expected object, received array'],
  ])('refuses %j', (body, message) => {
    expect(refusal(() => parseCreateScheduleBody(body))).toMatchObject({ message: [message] });
  });

  it('refuses a top-level __proto__ key', () => {
    const body = JSON.parse('{"action":"sync","cron":"0 9 * * *","timeZone":"UTC","__proto__":{}}');

    expect(refusal(() => parseCreateScheduleBody(body))).toMatchObject({
      message: ['property __proto__ should not exist'],
    });
  });
});

describe('parseUpdateScheduleBody', () => {
  it('keeps only the keys sent, a null name included', () => {
    expect(parseUpdateScheduleBody({ name: null, cron: '0 6 * * *' })).toStrictEqual({
      name: null,
      cron: '0 6 * * *',
    });
  });

  it.each([
    [' Renamed ', 'Renamed'],
    ['', null],
    ['   ', null],
  ])('trims the name %j, storing an empty result as null', (name, stored) => {
    expect(parseUpdateScheduleBody({ name })).toStrictEqual({ name: stored });
  });

  it('refuses enabled, which only pause and resume change', () => {
    expect(refusal(() => parseUpdateScheduleBody({ enabled: false }))).toMatchObject({
      message: ['property enabled should not exist'],
    });
  });

  it('keeps prototype keys in parameters as sent', () => {
    const parameters = '{"__proto__":{"y":4},"constructor":{"name":"z"}}';

    expect(
      JSON.stringify(parseUpdateScheduleBody(JSON.parse(`{"parameters":${parameters}}`)).parameters)
    ).toBe(parameters);
  });
});
