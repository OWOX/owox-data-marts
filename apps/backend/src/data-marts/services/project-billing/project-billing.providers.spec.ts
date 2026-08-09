import {
  AppEditionConfig,
  LicenseContext,
  ProjectBinding,
} from '../../../common/config/app-edition-config.service';
import { ProjectOperationBlockedException } from '../../../common/exceptions/project-operation-blocked.exception';
import { InternalProjectBillingService } from './internal-project-billing.service';
import { LicenseProjectBillingService } from './license-project-billing.service';
import { ProjectBillingService, RunKind } from './project-billing.service';
import { projectBillingProvider } from './project-billing.providers';
import { RestrictedProjectBillingService } from './restricted-project-billing.service';

const internal = {
  isBalanceConfigured: jest.fn(),
  verifyCanPerformOperations: jest.fn().mockResolvedValue(undefined),
} as unknown as InternalProjectBillingService;
const license = {
  verifyCanPerformOperations: jest.fn().mockResolvedValue(undefined),
} as unknown as LicenseProjectBillingService;
const restricted = {
  verifyCanPerformOperations: jest.fn().mockResolvedValue(undefined),
} as unknown as RestrictedProjectBillingService;

const impls = { internal, license, restricted };

let licenseContext: LicenseContext | null;

function resolve(context: LicenseContext | null, balanceConfigured = true): ProjectBillingService {
  licenseContext = context;
  (internal.isBalanceConfigured as jest.Mock).mockReturnValue(balanceConfigured);
  const appEditionConfig = {
    getLicenseContext: () => licenseContext,
  } as unknown as AppEditionConfig;
  const factory = projectBillingProvider as {
    useFactory: (...args: unknown[]) => ProjectBillingService;
  };
  return factory.useFactory(appEditionConfig, internal, license, restricted);
}

async function routedTarget(service: ProjectBillingService): Promise<string[]> {
  await service.verifyCanPerformOperations('proj-1', RunKind.SHEETS_REPORT_RUN);
  const hit = Object.entries(impls)
    .filter(([, impl]) => (impl.verifyCanPerformOperations as jest.Mock).mock.calls.length > 0)
    .map(([name]) => name);
  Object.values(impls).forEach(impl => (impl.verifyCanPerformOperations as jest.Mock).mockClear());
  return hit;
}

describe('projectBillingProvider', () => {
  it('routes to the internal service for an INTERNAL license', async () => {
    const service = resolve({ binding: ProjectBinding.INTERNAL, licenseKeyId: 'key-1' });
    await expect(routedTarget(service)).resolves.toEqual(['internal']);
  });

  it('fails startup when an INTERNAL license has no balance integration', () => {
    expect(() =>
      resolve({ binding: ProjectBinding.INTERNAL, licenseKeyId: 'key-1' }, false)
    ).toThrow('requires a complete balance integration');
  });

  it('routes to the license gateway for a LICENSE binding', async () => {
    const service = resolve({ binding: ProjectBinding.LICENSE, licenseKeyId: 'key-1' });
    await expect(routedTarget(service)).resolves.toEqual(['license']);
  });

  it('restricts when no managed license is active', async () => {
    const service = resolve(null);
    await expect(routedTarget(service)).resolves.toEqual(['restricted']);
  });

  it('restricts on the same instance once the hourly refresh drops an INTERNAL license', async () => {
    const service = resolve({ binding: ProjectBinding.INTERNAL, licenseKeyId: 'key-1' });
    await expect(routedTarget(service)).resolves.toEqual(['internal']);

    licenseContext = null;
    await expect(routedTarget(service)).resolves.toEqual(['restricted']);
  });

  it('recovers to the license gateway once the hourly refresh restores the license', async () => {
    const service = resolve(null);
    await expect(routedTarget(service)).resolves.toEqual(['restricted']);

    licenseContext = { binding: ProjectBinding.LICENSE, licenseKeyId: 'key-1' };
    await expect(routedTarget(service)).resolves.toEqual(['license']);
  });

  it('restricts an INTERNAL binding that appears at runtime without a balance integration', async () => {
    const service = resolve(null, false);
    licenseContext = { binding: ProjectBinding.INTERNAL, licenseKeyId: 'key-1' };
    await expect(routedTarget(service)).resolves.toEqual(['restricted']);
  });
});

describe('RestrictedProjectBillingService', () => {
  const service = new RestrictedProjectBillingService();

  it.each([
    RunKind.SHEETS_REPORT_RUN,
    RunKind.LOOKER_REPORT_RUN,
    RunKind.EMAIL_BASED_REPORT_RUN,
    RunKind.HTTP_DATA_RUN,
    RunKind.MCP_QUERY_RUN,
  ])('denies %s', async runKind => {
    await expect(service.verifyCanPerformOperations('proj-1', runKind)).rejects.toBeInstanceOf(
      ProjectOperationBlockedException
    );
  });

  it.each([RunKind.CONNECTOR_RUN, RunKind.DATA_QUALITY_RUN, RunKind.AI_PROCESS_RUN])(
    'still allows %s',
    async runKind => {
      await expect(service.verifyCanPerformOperations('proj-1', runKind)).resolves.toBeUndefined();
    }
  );
});
