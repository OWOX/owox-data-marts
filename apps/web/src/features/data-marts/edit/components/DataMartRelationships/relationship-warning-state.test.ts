import { describe, it, expect } from 'vitest';
import { getRelationshipWarningLabel, hasRelationshipWarning } from './relationship-warning-state';

describe('getRelationshipWarningLabel', () => {
  it('returns "No primary key" when isMissingPrimaryKey is the only flag set', () => {
    expect(getRelationshipWarningLabel({ isMissingPrimaryKey: true })).toBe('No primary key');
  });

  it('returns null when no flags are set', () => {
    expect(getRelationshipWarningLabel({})).toBeNull();
  });

  it('lets isCycleStub take precedence over isMissingPrimaryKey', () => {
    expect(getRelationshipWarningLabel({ isCycleStub: true, isMissingPrimaryKey: true })).toBe(
      'Loop'
    );
  });

  it('lets isDraft take precedence over isMissingPrimaryKey', () => {
    expect(getRelationshipWarningLabel({ isDraft: true, isMissingPrimaryKey: true })).toBe('Draft');
  });

  it('lets isJoinNotConfigured take precedence over isMissingPrimaryKey', () => {
    expect(
      getRelationshipWarningLabel({ isJoinNotConfigured: true, isMissingPrimaryKey: true })
    ).toBe('Join not configured');
  });

  it('lets isBlocked take precedence over isMissingPrimaryKey', () => {
    expect(getRelationshipWarningLabel({ isBlocked: true, isMissingPrimaryKey: true })).toBe(
      'Blocked'
    );
  });
});

describe('hasRelationshipWarning', () => {
  it('is true when only isMissingPrimaryKey is set', () => {
    expect(hasRelationshipWarning({ isMissingPrimaryKey: true })).toBe(true);
  });

  it('is false when no flags are set', () => {
    expect(hasRelationshipWarning({})).toBe(false);
  });
});
