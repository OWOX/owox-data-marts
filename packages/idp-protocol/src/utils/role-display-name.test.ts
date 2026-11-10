import { describe, expect, it } from '@jest/globals';
import { getRoleDisplayName, hasRoleDisplayName } from './role-display-name.js';

describe('getRoleDisplayName', () => {
  it('names each project role as the product does', () => {
    expect(getRoleDisplayName('admin')).toBe('Project Admin');
    expect(getRoleDisplayName('editor')).toBe('Data Owner');
    expect(getRoleDisplayName('viewer')).toBe('Business User');
  });

  it('returns any other value as is', () => {
    expect(getRoleDisplayName('owner')).toBe('owner');
    expect(getRoleDisplayName('constructor')).toBe('constructor');
  });
});

describe('hasRoleDisplayName', () => {
  it('is true only for project roles', () => {
    expect(hasRoleDisplayName('editor')).toBe(true);
    expect(hasRoleDisplayName('toString')).toBe(false);
  });
});
