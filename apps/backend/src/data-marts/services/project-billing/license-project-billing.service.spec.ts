import { ConfigService } from '@nestjs/config';
import { fetchWithBackoff } from '@owox/internal-helpers';
import {
  AppEditionConfig,
  ProjectBinding,
} from '../../../common/config/app-edition-config.service';
import { ProjectOperationBlockedException } from '../../../common/exceptions/project-operation-blocked.exception';
import { DataMart } from '../../entities/data-mart.entity';
import { ProjectBlockedReason } from '../../enums/project-blocked-reason.enum';
import { LicenseProjectBillingService } from './license-project-billing.service';
import { RunKind } from './project-billing.service';

jest.mock('@owox/internal-helpers', () => ({
  fetchWithBackoff: jest.fn(),
}));

const fetchWithBackoffMock = fetchWithBackoff as jest.MockedFunction<typeof fetchWithBackoff>;

function fakeDataMart(): DataMart {
  return {
    id: 'dm-1',
    projectId: 'local-project',
    title: 'My DM',
    storage: { id: 'storage-1', title: 'BQ', type: 'GOOGLE_BIGQUERY' },
  } as unknown as DataMart;
}

function buildService(
  env: Record<string, string | undefined> = { LICENSE_KEY: 'the-jwt' },
  licenseContext: unknown = {
    binding: ProjectBinding.LICENSE,
    licenseKeyId: 'key-1',
    billingProjectId: 'cloud-project',
    expiresAt: new Date(),
  }
): LicenseProjectBillingService {
  const configService = { get: (key: string) => env[key] } as unknown as ConfigService;
  const appEditionConfig = {
    getLicenseContext: () => licenseContext,
  } as unknown as AppEditionConfig;
  return new LicenseProjectBillingService(configService, appEditionConfig);
}

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body } as unknown as Response;
}

describe('LicenseProjectBillingService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('verifyCanPerformOperations', () => {
    it('allows a process run without contacting Cloud', async () => {
      const service = buildService();

      await expect(
        service.verifyCanPerformOperations('local-project', RunKind.CONNECTOR_RUN)
      ).resolves.toBeUndefined();
      expect(fetchWithBackoffMock).not.toHaveBeenCalled();
    });

    it('sends the license key and its identifier to the Cloud gateway', async () => {
      fetchWithBackoffMock.mockResolvedValue(jsonResponse({ allowed: true, blockedReasons: [] }));
      const service = buildService();

      await service.verifyCanPerformOperations('local-project', RunKind.HTTP_DATA_RUN);

      expect(fetchWithBackoffMock).toHaveBeenCalledWith(
        'https://app.owox.com/api/license/can-perform',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer the-jwt',
            'X-OWOX-License-Key-Id': 'key-1',
          }),
        })
      );
    });

    it('restricts the run when Cloud denies it', async () => {
      fetchWithBackoffMock.mockResolvedValue(
        jsonResponse({
          allowed: false,
          blockedReasons: [ProjectBlockedReason.OVERDRAFT_LIMIT_EXCEEDED],
        })
      );
      const service = buildService();

      await expect(
        service.verifyCanPerformOperations('local-project', RunKind.HTTP_DATA_RUN)
      ).rejects.toBeInstanceOf(ProjectOperationBlockedException);
    });

    it('fails the run when Cloud is unreachable after retries', async () => {
      fetchWithBackoffMock.mockRejectedValue(new Error('network down'));
      const service = buildService();

      await expect(
        service.verifyCanPerformOperations('local-project', RunKind.HTTP_DATA_RUN)
      ).rejects.toThrow('network down');
    });

    it('fails the run when the gateway responds with an error status', async () => {
      fetchWithBackoffMock.mockResolvedValue({ ok: false, status: 502 } as unknown as Response);
      const service = buildService();

      await expect(
        service.verifyCanPerformOperations('local-project', RunKind.HTTP_DATA_RUN)
      ).rejects.toThrow('failed with status 502');
    });

    it('restricts the run when the gateway rejects the license', async () => {
      fetchWithBackoffMock.mockResolvedValue({ ok: false, status: 401 } as unknown as Response);
      const service = buildService();

      await expect(
        service.verifyCanPerformOperations('local-project', RunKind.HTTP_DATA_RUN)
      ).rejects.toBeInstanceOf(ProjectOperationBlockedException);
    });

    it('restricts the run when no managed license is active', async () => {
      const service = buildService({ LICENSE_KEY: 'the-jwt' }, null);

      await expect(
        service.verifyCanPerformOperations('local-project', RunKind.HTTP_DATA_RUN)
      ).rejects.toBeInstanceOf(ProjectOperationBlockedException);
    });
  });

  describe('consumption registration', () => {
    it('forwards a report run as a kind and payload envelope', async () => {
      fetchWithBackoffMock.mockResolvedValue(jsonResponse({}));
      const service = buildService();

      await service.registerHttpDataRunConsumption(fakeDataMart(), 'run-1');

      const [url, init] = fetchWithBackoffMock.mock.calls[0];
      expect(url).toBe('https://app.owox.com/api/license/consumption');
      expect(JSON.parse(init?.body as string)).toEqual({
        kind: RunKind.HTTP_DATA_RUN,
        payload: expect.objectContaining({ dataMartId: 'dm-1', reportRunId: 'run-1' }),
      });
    });

    it('publishes nothing for a process run', async () => {
      const service = buildService();

      await service.registerConnectorRunConsumption();

      expect(fetchWithBackoffMock).not.toHaveBeenCalled();
    });

    it('never propagates a delivery failure to the caller', async () => {
      fetchWithBackoffMock.mockRejectedValue(new Error('network down'));
      const service = buildService();

      await expect(
        service.registerHttpDataRunConsumption(fakeDataMart(), 'run-1')
      ).resolves.toBeUndefined();
    });
  });
});
