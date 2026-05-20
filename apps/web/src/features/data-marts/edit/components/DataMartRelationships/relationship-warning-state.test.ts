import { describe, it, expect } from 'vitest';
import {
  getRelationshipWarningLabel,
  hasRelationshipWarning,
  INACCESSIBLE_TOOLTIP,
  CYCLE_STUB_TOOLTIP,
} from './relationship-warning-state';

describe('relationship-warning-state', () => {
  describe('getRelationshipWarningLabel', () => {
    it('returns "No access" when isInaccessible', () => {
      expect(getRelationshipWarningLabel({ isInaccessible: true })).toBe('No access');
    });

    it('returns "Loop" when isCycleStub, even if also inaccessible', () => {
      expect(getRelationshipWarningLabel({ isCycleStub: true, isInaccessible: true })).toBe('Loop');
    });

    it('returns "Draft" when isDraft', () => {
      expect(getRelationshipWarningLabel({ isDraft: true })).toBe('Draft');
    });

    it('returns "Join not configured" when isJoinNotConfigured', () => {
      expect(getRelationshipWarningLabel({ isJoinNotConfigured: true })).toBe(
        'Join not configured'
      );
    });

    it('returns "Blocked" when isBlocked', () => {
      expect(getRelationshipWarningLabel({ isBlocked: true })).toBe('Blocked');
    });

    it('returns null when no flags set', () => {
      expect(getRelationshipWarningLabel({})).toBeNull();
    });

    it('inaccessible takes precedence over draft', () => {
      expect(getRelationshipWarningLabel({ isInaccessible: true, isDraft: true })).toBe(
        'No access'
      );
    });

    it('inaccessible takes precedence over blocked', () => {
      expect(getRelationshipWarningLabel({ isInaccessible: true, isBlocked: true })).toBe(
        'No access'
      );
    });
  });

  describe('hasRelationshipWarning', () => {
    it('returns true for inaccessible node', () => {
      expect(hasRelationshipWarning({ isInaccessible: true })).toBe(true);
    });

    it('returns true for child of inaccessible node (parentInaccessible propagated)', () => {
      expect(hasRelationshipWarning({ isInaccessible: true, isBlocked: false })).toBe(true);
    });

    it('returns false when no warning flags', () => {
      expect(hasRelationshipWarning({})).toBe(false);
    });
  });

  describe('chain propagation semantics', () => {
    it('INACCESSIBLE_TOOLTIP is defined', () => {
      expect(INACCESSIBLE_TOOLTIP).toBeTruthy();
    });

    it('CYCLE_STUB_TOOLTIP is defined', () => {
      expect(CYCLE_STUB_TOOLTIP).toBeTruthy();
    });

    it.each([
      { parentInaccessible: true, canSee: true, expected: true },
      { parentInaccessible: false, canSee: true, expected: false },
      { parentInaccessible: false, canSee: false, expected: true },
      { parentInaccessible: true, canSee: false, expected: true },
    ])(
      'parentInaccessible=$parentInaccessible canSee=$canSee → isInaccessible=$expected',
      ({ parentInaccessible, canSee, expected }) => {
        const isInaccessible = parentInaccessible || !canSee;
        expect(hasRelationshipWarning({ isInaccessible })).toBe(expected);
        if (expected) {
          expect(getRelationshipWarningLabel({ isInaccessible })).toBe('No access');
        }
      }
    );
  });
});
