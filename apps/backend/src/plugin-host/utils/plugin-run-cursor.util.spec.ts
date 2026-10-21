import { decodePluginRunCursor, encodePluginRunCursor } from './plugin-run-cursor.util';

const CURSOR = {
  createdAt: new Date('2026-10-17T10:00:00.000Z'),
  id: '1b4e28ba-2fa1-41d2-883f-0016d3cca427',
};
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

describe('plugin run cursor', () => {
  it('reads back what it wrote, as URL-safe text', () => {
    const cursor = encodePluginRunCursor(CURSOR);

    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodePluginRunCursor(cursor)).toEqual(CURSOR);
  });

  it.each([
    ['text that is not base64url JSON', 'not a cursor'],
    ['JSON that is not an object', encode(['2026-10-17T10:00:00.000Z'])],
    ['a date that is not ISO', encode({ createdAt: 'yesterday', id: CURSOR.id })],
    ['an id that is not a UUID', encode({ createdAt: '2026-10-17T10:00:00.000Z', id: 'e1' })],
    [
      'an extra key',
      encode({ createdAt: '2026-10-17T10:00:00.000Z', id: CURSOR.id, userId: 'u1' }),
    ],
    ['a Plugin history cursor', CURSOR.id],
  ])('answers null for %s', (_case, value) => {
    expect(decodePluginRunCursor(value)).toBeNull();
  });
});
