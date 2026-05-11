import { describe, expect, it } from '@jest/globals';
import { OwoxUserProvisioningSettingsResponseSchema } from './userProvisioningDto.js';

describe('OwoxUserProvisioningSettingsResponseSchema', () => {
  it('accepts automatic viewer settings with nullable main project fields', () => {
    const actual = OwoxUserProvisioningSettingsResponseSchema.parse({
      isApplicable: true,
      organization: {
        name: 'owox.com',
        mainProjectName: null,
        mainProjectTitle: null,
      },
      settings: {
        mode: 'automatic',
        defaultRole: 'viewer',
      },
    });

    expect(actual.isApplicable).toBe(true);
    expect(actual.organization).toMatchObject({
      name: 'owox.com',
      mainProjectName: null,
    });
    expect(actual.settings).toMatchObject({
      mode: 'automatic',
      defaultRole: 'viewer',
    });
  });

  it('accepts not applicable settings for projects without organization', () => {
    const actual = OwoxUserProvisioningSettingsResponseSchema.parse({
      isApplicable: false,
      organization: null,
      settings: null,
    });

    expect(actual.isApplicable).toBe(false);
    expect(actual.organization).toBeNull();
    expect(actual.settings).toBeNull();
  });

  it('rejects unknown mode and role values', () => {
    expect(() =>
      OwoxUserProvisioningSettingsResponseSchema.parse({
        isApplicable: true,
        organization: {
          name: 'owox.com',
          mainProjectName: 'main-project',
          mainProjectTitle: 'Main Project',
        },
        settings: {
          mode: 'enabled',
          defaultRole: 'owner',
        },
      })
    ).toThrow();
  });
});
