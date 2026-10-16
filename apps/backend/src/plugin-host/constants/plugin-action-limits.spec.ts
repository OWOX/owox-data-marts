import { isPluginOwnedErrorCode } from './plugin-action-limits';

describe('isPluginOwnedErrorCode', () => {
  it.each(['DOCUMENT_LOCKED', 'A', `A${'B'.repeat(63)}`])('accepts %s', code => {
    expect(isPluginOwnedErrorCode(code)).toBe(true);
  });

  it.each([
    'not_upper',
    '1ABC',
    `A${'B'.repeat(64)}`,
    'BACKEND_X',
    'BACKEND_UNREACHABLE',
    'TIMED_OUT',
    'CANCELLED',
    'ACTION_NOT_DECLARED',
    'INVALID_INPUT',
    'INSTALLATION_INACTIVE',
    'PLUGIN_SUSPENDED',
    '',
  ])('refuses %s', code => {
    expect(isPluginOwnedErrorCode(code)).toBe(false);
  });

  it.each([42, null, undefined, { code: 'X' }])('refuses the non-string %p', code => {
    expect(isPluginOwnedErrorCode(code)).toBe(false);
  });
});
