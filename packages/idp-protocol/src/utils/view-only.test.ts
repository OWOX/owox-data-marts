import { describe, expect, it } from '@jest/globals';
import type { Payload } from '../types/models.js';
import { isViewOnlyPayload, resolveViewOnlyFromClaims } from './view-only.js';

describe('resolveViewOnlyFromClaims', () => {
  it('returns false for nullish claims', () => {
    expect(resolveViewOnlyFromClaims(null)).toBe(false);
    expect(resolveViewOnlyFromClaims(undefined)).toBe(false);
  });

  it('returns true only when viewOnly is boolean true', () => {
    expect(resolveViewOnlyFromClaims({ viewOnly: true })).toBe(true);
    expect(resolveViewOnlyFromClaims({ viewOnly: false })).toBe(false);
  });

  it('ignores non-contract fields such as readOnly and roles', () => {
    expect(resolveViewOnlyFromClaims({ readOnly: true })).toBe(false);
    expect(resolveViewOnlyFromClaims({ roles: ['viewer'] })).toBe(false);
  });

  it('ignores non-boolean viewOnly values', () => {
    expect(resolveViewOnlyFromClaims({ viewOnly: 'true' })).toBe(false);
  });

  it('returns false when no view-only signal is present', () => {
    expect(resolveViewOnlyFromClaims({ userId: 'u1', roles: ['admin'] })).toBe(false);
  });
});

describe('isViewOnlyPayload', () => {
  it('returns false for nullish payload', () => {
    expect(isViewOnlyPayload(null)).toBe(false);
    expect(isViewOnlyPayload(undefined)).toBe(false);
  });

  it('reads only Payload.viewOnly', () => {
    const payload: Payload = {
      userId: 'user-1',
      projectId: 'project-1',
      viewOnly: true,
    };

    expect(isViewOnlyPayload(payload)).toBe(true);
    expect(
      isViewOnlyPayload({
        userId: 'user-1',
        projectId: 'project-1',
        viewOnly: false,
      })
    ).toBe(false);
    expect(
      isViewOnlyPayload({
        userId: 'user-1',
        projectId: 'project-1',
      })
    ).toBe(false);
  });

  it('does not treat unrelated passthrough claims as view-only', () => {
    const payload = {
      userId: 'user-1',
      projectId: 'project-1',
      readOnly: true,
      roles: ['viewer'],
    } as Payload;

    expect(isViewOnlyPayload(payload)).toBe(false);
  });
});
