import {
  AppEditionConfig,
  ProjectBinding,
} from '../../../common/config/app-edition-config.service';
import { RunRestrictedException } from '../../../common/exceptions/run-restricted.exception';
import { InternalProjectBilling } from './internal-project-billing.service';
import { LicenseProjectBilling } from './license-project-billing.service';
import { RunKind } from './project-billing';
import { projectBillingProvider } from './project-billing.providers';
import { RestrictedProjectBilling } from './restricted-project-billing.service';

const internal = { isBalanceConfigured: jest.fn() } as unknown as InternalProjectBilling;
const license = {} as LicenseProjectBilling;
const restricted = {} as RestrictedProjectBilling;

function resolve(licenseContext: unknown, balanceConfigured = true) {
  (internal.isBalanceConfigured as jest.Mock).mockReturnValue(balanceConfigured);
  const appEditionConfig = {
    getLicenseContext: () => licenseContext,
  } as unknown as AppEditionConfig;
  const factory = projectBillingProvider as { useFactory: (...args: unknown[]) => unknown };
  return factory.useFactory(appEditionConfig, internal, license, restricted);
}

describe('projectBillingProvider', () => {
  beforeEach(() => jest.clearAllMocks());

  it('selects the internal binding for an INTERNAL license', () => {
    expect(resolve({ binding: ProjectBinding.INTERNAL })).toBe(internal);
  });

  it('fails startup when an INTERNAL license has no balance integration', () => {
    expect(() => resolve({ binding: ProjectBinding.INTERNAL }, false)).toThrow(
      'requires a complete balance integration'
    );
  });

  it('selects the license gateway for a LICENSE binding', () => {
    expect(resolve({ binding: ProjectBinding.LICENSE })).toBe(license);
  });

  it('restricts when no managed license is active', () => {
    expect(resolve(null)).toBe(restricted);
  });
});

describe('RestrictedProjectBilling', () => {
  const service = new RestrictedProjectBilling();

  it.each([
    RunKind.SHEETS_REPORT_RUN,
    RunKind.LOOKER_REPORT_RUN,
    RunKind.EMAIL_BASED_REPORT_RUN,
    RunKind.HTTP_DATA_RUN,
    RunKind.MCP_QUERY_RUN,
  ])('denies %s', async runKind => {
    await expect(service.authorizeRun({ projectId: 'proj-1', runKind })).rejects.toBeInstanceOf(
      RunRestrictedException
    );
  });

  it.each([RunKind.CONNECTOR_RUN, RunKind.DATA_QUALITY_RUN, RunKind.AI_PROCESS_RUN])(
    'still allows %s',
    async runKind => {
      await expect(service.authorizeRun({ projectId: 'proj-1', runKind })).resolves.toEqual({
        projectId: 'proj-1',
        runKind,
      });
    }
  );

  it('reports a zero balance', async () => {
    await expect(service.getBalance()).resolves.toMatchObject({ availableCredits: 0 });
  });
});
