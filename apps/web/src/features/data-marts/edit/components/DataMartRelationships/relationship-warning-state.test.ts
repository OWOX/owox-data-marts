import { describe, it, expect } from 'vitest';
import {
  getRelationshipIndicator,
  hasConnectionWarning,
  hasNodeWarning,
} from './relationship-warning-state';

describe('getRelationshipIndicator', () => {
  it('returns kind "attention" and label "No primary key" when isMissingPrimaryKey is the only flag set', () => {
    expect(getRelationshipIndicator({ isMissingPrimaryKey: true })).toEqual({
      label: 'No primary key',
      kind: 'attention',
    });
  });

  it('returns null when no flags are set', () => {
    expect(getRelationshipIndicator({})).toBeNull();
  });

  it('returns kind "warning" for isCycleStub, which takes precedence over isMissingPrimaryKey', () => {
    expect(getRelationshipIndicator({ isCycleStub: true, isMissingPrimaryKey: true })).toEqual({
      label: 'Loop',
      kind: 'warning',
    });
  });

  it('returns kind "warning" for isDraft, which takes precedence over isMissingPrimaryKey', () => {
    expect(getRelationshipIndicator({ isDraft: true, isMissingPrimaryKey: true })).toEqual({
      label: 'Draft',
      kind: 'warning',
    });
  });

  it('returns kind "warning" for isJoinNotConfigured, which takes precedence over isMissingPrimaryKey', () => {
    expect(
      getRelationshipIndicator({ isJoinNotConfigured: true, isMissingPrimaryKey: true })
    ).toEqual({ label: 'Join not configured', kind: 'warning' });
  });

  it('returns kind "warning" for isBlocked, which takes precedence over isMissingPrimaryKey', () => {
    expect(getRelationshipIndicator({ isBlocked: true, isMissingPrimaryKey: true })).toEqual({
      label: 'Blocked',
      kind: 'warning',
    });
  });
});

describe('hasNodeWarning (warning-kind only, excludes attention)', () => {
  it('is false when only isMissingPrimaryKey is set (attention-kind, not warning-kind)', () => {
    expect(hasNodeWarning({ isMissingPrimaryKey: true })).toBe(false);
  });

  it('is false when no flags are set', () => {
    expect(hasNodeWarning({})).toBe(false);
  });

  it('is true for isDraft', () => {
    expect(hasNodeWarning({ isDraft: true })).toBe(true);
  });

  it('is true for isBlocked', () => {
    expect(hasNodeWarning({ isBlocked: true })).toBe(true);
  });

  it('is true for isJoinNotConfigured', () => {
    expect(hasNodeWarning({ isJoinNotConfigured: true })).toBe(true);
  });

  it('is true for isCycleStub', () => {
    expect(hasNodeWarning({ isCycleStub: true })).toBe(true);
  });
});

describe('hasConnectionWarning (#6733 — edge coloring excludes attention-kind)', () => {
  it('does NOT color the edge when the target node is missing a primary key only (attention-kind)', () => {
    const source = { isMissingPrimaryKey: false };
    const target = { isMissingPrimaryKey: true };
    expect(hasConnectionWarning(source, target)).toBe(false);
  });

  it('does NOT color the edge when the source node is missing a primary key only', () => {
    const source = { isMissingPrimaryKey: true };
    const target = { isMissingPrimaryKey: false };
    expect(hasConnectionWarning(source, target)).toBe(false);
  });

  it('does not color the edge when neither endpoint has an indicator', () => {
    const source = { isMissingPrimaryKey: false, isDraft: false };
    const target = { isMissingPrimaryKey: false, isDraft: false };
    expect(hasConnectionWarning(source, target)).toBe(false);
  });

  it('still colors the edge for the warning-kind flags (draft, blocked, join-not-configured, cycle-stub)', () => {
    expect(hasConnectionWarning({ isDraft: true }, undefined)).toBe(true);
    expect(hasConnectionWarning(undefined, { isBlocked: true })).toBe(true);
    expect(hasConnectionWarning({ isJoinNotConfigured: true }, undefined)).toBe(true);
    expect(hasConnectionWarning(undefined, { isCycleStub: true })).toBe(true);
  });

  it('colors the edge when an endpoint has a warning-kind flag even alongside missing-PK', () => {
    expect(hasConnectionWarning({ isDraft: true, isMissingPrimaryKey: true }, undefined)).toBe(
      true
    );
  });

  it('handles undefined source/target (mirrors optional-chaining behavior of the original code)', () => {
    expect(hasConnectionWarning(undefined, undefined)).toBe(false);
  });
});
