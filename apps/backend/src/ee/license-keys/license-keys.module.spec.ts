jest.mock('../../common/common.module', () => ({ CommonModule: function CommonModule() {} }));
jest.mock('../../data-marts/data-marts.module', () => ({
  DataMartsModule: function DataMartsModule() {},
}));
jest.mock('../../idp/idp.module', () => ({ IdpModule: function IdpModule() {} }));

import { LicenseGatewayController } from './controllers/license-gateway.controller';
import { LicenseKeyController } from './controllers/license-key.controller';
import { LicenseKeysModule } from './license-keys.module';

describe('LicenseKeysModule', () => {
  const originalFlag = process.env.LICENSE_ISSUANCE_ENABLED;

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.LICENSE_ISSUANCE_ENABLED;
    else process.env.LICENSE_ISSUANCE_ENABLED = originalFlag;
  });

  it('does not mount Cloud-only controllers by default', () => {
    delete process.env.LICENSE_ISSUANCE_ENABLED;

    expect(LicenseKeysModule.register().controllers).toEqual([]);
  });

  it('mounts management and gateway controllers when issuance is enabled', () => {
    process.env.LICENSE_ISSUANCE_ENABLED = 'true';

    expect(LicenseKeysModule.register().controllers).toEqual([
      LicenseKeyController,
      LicenseGatewayController,
    ]);
  });
});
