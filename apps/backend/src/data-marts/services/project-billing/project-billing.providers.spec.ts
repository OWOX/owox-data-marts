import {
  AppEditionConfig,
  LicenseContext,
  ProjectBinding,
} from '../../../common/config/app-edition-config.service';
import { ProjectOperationBlockedException } from '../../../common/exceptions/project-operation-blocked.exception';
import { BindingAwareProjectBillingService } from './binding-aware-project-billing.service';
import { InternalProjectBillingService } from './internal-project-billing.service';
import { LicenseProjectBillingService } from './license-project-billing.service';
import { ProjectBillingService, RunKind } from './project-billing.service';
import { projectBillingProvider } from './project-billing.providers';
import { RestrictedProjectBillingService } from './restricted-project-billing.service';

const internal = {
  consumesBalance: jest.fn().mockReturnValue(true),
  registerPluginAiProcessRunConsumption: jest.fn().mockResolvedValue(undefined),
  isBalanceConfigured: jest.fn(),
  verifyCanPerformOperations: jest.fn().mockResolvedValue(undefined),
} as unknown as InternalProjectBillingService;
const license = {
  consumesBalance: jest.fn().mockReturnValue(false),
  registerPluginAiProcessRunConsumption: jest.fn().mockResolvedValue(undefined),
  verifyCanPerformOperations: jest.fn().mockResolvedValue(undefined),
} as unknown as LicenseProjectBillingService;
const restricted = {
  consumesBalance: jest.fn().mockReturnValue(false),
  registerPluginAiProcessRunConsumption: jest.fn().mockResolvedValue(undefined),
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

describe('BindingAwareProjectBillingService', () => {
  const pluginContext = { projectId: 'proj-1', pluginId: 'plugin-1', pluginTitle: 'My Plugin' };

  it.each([
    ['INTERNAL', { binding: ProjectBinding.INTERNAL, licenseKeyId: 'key-1' }, 'internal'],
    ['LICENSE', { binding: ProjectBinding.LICENSE, licenseKeyId: 'key-1' }, 'license'],
    ['none', null, 'restricted'],
  ] as const)(
    'delegates plugin AI Process Runs to the bound service for %s',
    async (_, context, target) => {
      Object.values(impls).forEach(impl =>
        (impl.registerPluginAiProcessRunConsumption as jest.Mock).mockClear()
      );
      const service = resolve(context);

      await service.registerPluginAiProcessRunConsumption(1234, pluginContext);

      for (const [name, impl] of Object.entries(impls)) {
        const calls = (impl.registerPluginAiProcessRunConsumption as jest.Mock).mock.calls;
        expect(calls).toEqual(name === target ? [[1234, pluginContext]] : []);
      }
    }
  );
});

describe('BindingAwareProjectBillingService.consumesBalance', () => {
  it.each([
    ['INTERNAL with a configured balance', ProjectBinding.INTERNAL, true, true],
    ['INTERNAL without a configured balance', ProjectBinding.INTERNAL, false, false],
    ['LICENSE', ProjectBinding.LICENSE, true, false],
    ['no license', undefined, true, false],
  ])('follows the routed service for %s', (_name, binding, balanceConfigured, expected) => {
    (internal.isBalanceConfigured as jest.Mock).mockReturnValue(balanceConfigured);
    const service = new BindingAwareProjectBillingService(
      { getLicenseContext: () => (binding ? { binding } : null) } as unknown as AppEditionConfig,
      internal,
      license,
      restricted
    );

    expect(service.consumesBalance()).toBe(expected);
  });
});

describe('RestrictedProjectBillingService', () => {
  const service = new RestrictedProjectBillingService();

  it('does not consume the project balance', () => {
    expect(service.consumesBalance()).toBe(false);
  });

  it('skips plugin AI Process Runs', async () => {
    await expect(service.registerPluginAiProcessRunConsumption()).resolves.toBeUndefined();
  });

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
