import { ConfigService } from '@nestjs/config';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { OwoxStorageConfigService } from './owox-storage-config.service';

const fakeConfig = (values: Record<string, unknown>) =>
  ({ get: (name: string) => values[name] }) as unknown as ConfigService;

describe('OwoxStorageConfigService', () => {
  it('reads numeric limits returned by the validated config', () => {
    const service = new OwoxStorageConfigService(
      fakeConfig({
        OWOX_STORAGE_ENGINE: 'bigquery',
        BALANCE_ENDPOINT_BASE_URL: 'https://ib.example/internal-api/bi-project/',
        BALANCE_ENDPOINT_AUTH_SERVICE_ACCOUNT: 'c2c@secure.iam.gserviceaccount.com',
        BALANCE_ENDPOINT_TARGET_AUDIENCE: 'integrated-backend/api',
        OWOX_STORAGE_STORAGE_LIMIT_GIB: 200,
      })
    );

    expect(service.isEnabled()).toBe(true);
    expect(service.getSettings()).toMatchObject({
      storageLimitBytes: 200 * 2 ** 30,
    });
  });

  it('is disabled and refuses getSettings when the engine is unset', () => {
    const service = new OwoxStorageConfigService(fakeConfig({}));

    expect(service.isEnabled()).toBe(false);
    expect(() => service.getSettings()).toThrow(BusinessViolationException);
  });
});
