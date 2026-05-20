import { describe, it, expect } from 'vitest';
import { deriveTransientInaccessible } from '../compute-graph-state';

describe('deriveTransientInaccessible', () => {
  it.each([
    {
      parentInaccessible: false,
      access: { canSee: true, canUse: true, canEdit: true },
      expected: false,
    },
    {
      parentInaccessible: false,
      access: { canSee: false, canUse: false, canEdit: false },
      expected: true,
    },
    {
      parentInaccessible: true,
      access: { canSee: true, canUse: true, canEdit: true },
      expected: true,
    },
    {
      parentInaccessible: true,
      access: { canSee: false, canUse: false, canEdit: false },
      expected: true,
    },
    {
      parentInaccessible: false,
      access: undefined,
      expected: false,
    },
    {
      parentInaccessible: true,
      access: undefined,
      expected: true,
    },
  ])(
    'parentInaccessible=$parentInaccessible access.canSee=$access.canSee → $expected',
    ({ parentInaccessible, access, expected }) => {
      expect(deriveTransientInaccessible(parentInaccessible, access)).toBe(expected);
    }
  );

  it('returns inaccessible when parent is inaccessible even if own canSee=true', () => {
    expect(deriveTransientInaccessible(true, { canSee: true, canUse: true, canEdit: true })).toBe(
      true
    );
  });

  it('diamond per-path: node under inaccessible parent is inaccessible regardless of accessible sibling path', () => {
    const blockedParent = true;
    const accessibleSelf = { canSee: true, canUse: true, canEdit: true };
    expect(deriveTransientInaccessible(blockedParent, accessibleSelf)).toBe(true);

    const accessibleParent = false;
    expect(deriveTransientInaccessible(accessibleParent, accessibleSelf)).toBe(false);
  });
});
