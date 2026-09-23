import { ROLE_HIERARCHY, satisfiesRole } from './role-hierarchy';

/**
 * The hierarchy is now shared by IdpGuard (every `@Auth(Role.x)` REST handler) and the MCP
 * facades, so widening a row here widens both surfaces at once. These cases pin the whole
 * table rather than a sampling of it: a change has to be stated deliberately, and a viewer
 * quietly gaining an editor's row would otherwise only fail wherever someone happened to
 * have written a test.
 */
describe('role hierarchy', () => {
  it('pins which roles satisfy each required role', () => {
    expect(ROLE_HIERARCHY).toEqual({
      viewer: ['viewer', 'editor', 'admin'],
      editor: ['editor', 'admin'],
      admin: ['admin'],
    });
  });

  it.each([
    [['viewer'], 'viewer', true],
    [['editor'], 'viewer', true],
    [['admin'], 'viewer', true],
    [['viewer'], 'editor', false],
    [['editor'], 'editor', true],
    [['admin'], 'editor', true],
    [['viewer'], 'admin', false],
    [['editor'], 'admin', false],
    [['admin'], 'admin', true],
  ] as const)('satisfiesRole(%p, %p) === %p', (roles, required, expected) => {
    expect(satisfiesRole(roles, required)).toBe(expected);
  });

  it('satisfies nothing for an empty or unrecognised role list', () => {
    expect(satisfiesRole([], 'viewer')).toBe(false);
    expect(satisfiesRole(['owner'], 'editor')).toBe(false);
  });

  it('is satisfied when any one of several roles qualifies', () => {
    expect(satisfiesRole(['viewer', 'admin'], 'editor')).toBe(true);
  });
});
