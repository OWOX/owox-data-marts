import { ConfigService } from '@nestjs/config';
import { fetchWithBackoff } from '@owox/internal-helpers';
import {
  AppEditionConfig,
  ProjectBinding,
} from '../../../common/config/app-edition-config.service';
import { ProjectOperationBlockedException } from '../../../common/exceptions/project-operation-blocked.exception';
import { DataMart } from '../../entities/data-mart.entity';
import { ProjectBlockedReason } from '../../enums/project-blocked-reason.enum';
import { ProjectPlanType } from '../../enums/project-plan-type.enum';
import { LicenseProjectBilling } from './license-project-billing.service';
import { RunKind } from './project-billing';

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
): LicenseProjectBilling {
  const configService = { get: (key: string) => env[key] } as unknown as ConfigService;
  const appEditionConfig = {
    getLicenseContext: () => licenseContext,
  } as unknown as AppEditionConfig;
  return new LicenseProjectBilling(configService, appEditionConfig);
}

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body } as unknown as Response;
}

const httpDataGrant = { projectId: 'local-project', runKind: RunKind.HTTP_DATA_RUN };

describe('LicenseProjectBilling', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('authorizeRun', () => {
    it('grants a process run without contacting Cloud', async () => {
      const service = buildService();

      await expect(
        service.authorizeRun({ projectId: 'local-project', runKind: RunKind.CONNECTOR_RUN })
      ).resolves.toEqual({ projectId: 'local-project', runKind: RunKind.CONNECTOR_RUN });
      expect(fetchWithBackoffMock).not.toHaveBeenCalled();
    });

    it('sends the license key and its identifier to the Cloud gateway', async () => {
      fetchWithBackoffMock.mockResolvedValue(jsonResponse({ allowed: true, blockedReasons: [] }));
      const service = buildService();

      await service.authorizeRun({
        projectId: 'local-project',
        runKind: RunKind.HTTP_DATA_RUN,
      });

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
        service.authorizeRun({ projectId: 'local-project', runKind: RunKind.HTTP_DATA_RUN })
      ).rejects.toBeInstanceOf(ProjectOperationBlockedException);
    });

    it('fails the run when Cloud is unreachable after retries', async () => {
      fetchWithBackoffMock.mockRejectedValue(new Error('network down'));
      const service = buildService();

      await expect(
        service.authorizeRun({ projectId: 'local-project', runKind: RunKind.HTTP_DATA_RUN })
      ).rejects.toThrow('network down');
    });

    it('fails the run when the gateway responds with an error status', async () => {
      fetchWithBackoffMock.mockResolvedValue({ ok: false, status: 502 } as unknown as Response);
      const service = buildService();

      await expect(
        service.authorizeRun({ projectId: 'local-project', runKind: RunKind.HTTP_DATA_RUN })
      ).rejects.toThrow('failed with status 502');
    });

    it('fails the run when no managed license is active', async () => {
      const service = buildService({ LICENSE_KEY: 'the-jwt' }, null);

      await expect(
        service.authorizeRun({ projectId: 'local-project', runKind: RunKind.HTTP_DATA_RUN })
      ).rejects.toThrow('No valid managed license is active');
    });
  });

  describe('registerConsumption', () => {
    it('forwards a report run as a kind and payload envelope', async () => {
      fetchWithBackoffMock.mockResolvedValue(jsonResponse({}));
      const service = buildService();

      await service.registerConsumption(httpDataGrant, {
        kind: RunKind.HTTP_DATA_RUN,
        dataMart: fakeDataMart(),
        runId: 'run-1',
      });

      const [url, init] = fetchWithBackoffMock.mock.calls[0];
      expect(url).toBe('https://app.owox.com/api/license/consumption');
      expect(JSON.parse(init?.body as string)).toEqual({
        kind: RunKind.HTTP_DATA_RUN,
        payload: expect.objectContaining({ dataMartId: 'dm-1', reportRunId: 'run-1' }),
      });
    });

    it('publishes nothing for a process run', async () => {
      const service = buildService();

      await service.registerConsumption(
        { projectId: 'local-project', runKind: RunKind.CONNECTOR_RUN },
        { kind: RunKind.CONNECTOR_RUN, dataMart: fakeDataMart(), connectorRunId: 'run-1' }
      );

      expect(fetchWithBackoffMock).not.toHaveBeenCalled();
    });

    it('never propagates a delivery failure to the caller', async () => {
      fetchWithBackoffMock.mockRejectedValue(new Error('network down'));
      const service = buildService();

      await expect(
        service.registerConsumption(httpDataGrant, {
          kind: RunKind.HTTP_DATA_RUN,
          dataMart: fakeDataMart(),
          runId: 'run-1',
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('getBalance', () => {
    it('reads the balance through the gateway', async () => {
      const balance = {
        subscriptionPlanType: ProjectPlanType.FREE,
        availableCredits: 10,
        consumedCredits: 5,
        creditUsagePercentage: 33,
      };
      fetchWithBackoffMock.mockResolvedValue(jsonResponse(balance));

      await expect(buildService().getBalance()).resolves.toEqual(balance);
      expect(fetchWithBackoffMock).toHaveBeenCalledWith(
        'https://app.owox.com/api/license/balance',
        expect.anything()
      );
    });

    it('degrades to the zero balance when the gateway is unavailable', async () => {
      fetchWithBackoffMock.mockRejectedValue(new Error('network down'));

      await expect(buildService().getBalance()).resolves.toEqual({
        subscriptionPlanType: ProjectPlanType.FREE,
        availableCredits: 0,
        consumedCredits: 0,
        creditUsagePercentage: 0,
      });
    });
  });
});
