import { extractRunErrorMessage } from './run-error-message';

describe('extractRunErrorMessage', () => {
  it.each([
    [JSON.stringify({ error: 'storage read failed' }), 'storage read failed'],
    [JSON.stringify({ message: 'worker failed' }), 'worker failed'],
    [JSON.stringify({ msg: 'delivery failed' }), 'delivery failed'],
    ['plain trigger failure', 'plain trigger failure'],
    [JSON.stringify({ detail: 'not supported' }), JSON.stringify({ detail: 'not supported' })],
  ])('extracts a readable run error from %s', (entry, expected) => {
    expect(extractRunErrorMessage(entry)).toBe(expected);
  });
});
