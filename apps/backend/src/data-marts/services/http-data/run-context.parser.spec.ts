import { parseRunContext } from './run-context.parser';

/** Base64 of UTF-8, the shape the add-in sends. */
function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

describe('parseRunContext', () => {
  it('reads where the run put its rows', () => {
    const context = {
      host: 'excel',
      documentTitle: 'Q3 planning',
      sheetId: 'sheet-3',
      sheetName: 'Revenue',
    };

    expect(parseRunContext(encode(context))).toEqual(context);
  });

  it('keeps a worksheet named outside ASCII intact', () => {
    // The reason the header is base64 at all: a tab named in Ukrainian must survive the wire.
    const context = { host: 'excel', documentTitle: 'Звіти', sheetName: 'Дохід 📊' };

    expect(parseRunContext(encode(context))).toMatchObject({ sheetName: 'Дохід 📊' });
  });

  it.each([
    ['absent', undefined],
    ['empty', ''],
    ['not base64', '!!!not-base64!!!'],
    ['base64 of something that is not JSON', Buffer.from('hello', 'utf8').toString('base64')],
    ['JSON of the wrong shape', Buffer.from('[1,2,3]', 'utf8').toString('base64')],
  ])('gives up quietly when the header is %s', (_case, value) => {
    // Never an error: this is a note about where a run happened, and a malformed one must not
    // cost the run its rows.
    expect(parseRunContext(value)).toBeUndefined();
  });

  it('refuses a worksheet name long enough to bury a run history', () => {
    // The value comes from a user's keyboard and ends up in everyone else's run history.
    const context = { host: 'excel', sheetName: 'x'.repeat(1000) };

    expect(parseRunContext(encode(context))).toBeUndefined();
  });

  it('needs the host to be named, so a later client can be told apart', () => {
    expect(parseRunContext(encode({ documentTitle: 'Book' }))).toBeUndefined();
  });
});
