import { describe, expect, it } from 'vitest';
import { resolveContinueTarget, splitEmailInput } from './invite-teammates.utils';

describe('splitEmailInput', () => {
  it('splits on commas, semicolons and whitespace and lower-cases', () => {
    expect(splitEmailInput(' Ann@x.com,bob@x.com;\ncarl@x.com  ')).toEqual([
      'ann@x.com',
      'bob@x.com',
      'carl@x.com',
    ]);
  });
});

describe('resolveContinueTarget', () => {
  it.each([
    ['/ui/p1/data-marts?tab=all', '/ui/p1/data-marts?tab=all'],
    [null, '/'],
    ['https://evil.example', '/'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['/', '/'],
    ['/ui/p1/onboarding/invite-teammates', '/'],
    ['/ui/p1/Onboarding/Invite-Teammates?redirect=%2F', '/'],
    ['/ui/p1/data-marts ', '/ui/p1/data-marts'],
    ['/ui/p1/\tdata-marts', '/'],
    ['/auth/sign-in', '/'],
  ])('%s → %s', (raw, expected) => {
    expect(resolveContinueTarget(raw)).toBe(expected);
  });
});
