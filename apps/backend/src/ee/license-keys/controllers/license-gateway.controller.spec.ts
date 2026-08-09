import { RunKind } from '../../../data-marts/services/project-billing/project-billing.service';
import { LicenseGatewayController } from './license-gateway.controller';

describe('LicenseGatewayController', () => {
  const licenseKey = {
    projectId: 'billing-project',
    licenseKeyId: 'key-1',
    name: 'Production',
    origin: 'https://customer.test',
  };

  const createController = (configured = true) => {
    const billing = {
      isBalanceConfigured: jest.fn().mockReturnValue(configured),
      canPerformOperations: jest.fn().mockResolvedValue({ allowed: true, blockedReasons: [] }),
      publishForwardedConsumption: jest.fn().mockResolvedValue(undefined),
      getBalance: jest.fn().mockResolvedValue({ availableCredits: 10 }),
    };
    return {
      controller: new LicenseGatewayController(billing as never),
      billing,
    };
  };

  it('fails startup without the balance integration', () => {
    expect(() => createController(false)).toThrow('requires the balance integration');
  });

  it('uses only the verified license context for billing and attribution', async () => {
    const { controller, billing } = createController();
    const request = { licenseKey } as never;
    const payload = { projectId: 'untrusted-local-project', runId: 'run-1' };

    await controller.canPerform(request);
    await controller.consumption(request, { kind: RunKind.MCP_QUERY_RUN, payload });
    await controller.balance(request);

    expect(billing.canPerformOperations).toHaveBeenCalledWith('billing-project');
    expect(billing.publishForwardedConsumption).toHaveBeenCalledWith(
      RunKind.MCP_QUERY_RUN,
      payload,
      {
        projectId: 'billing-project',
        licenseKeyId: 'key-1',
        title: 'Production',
        origin: 'https://customer.test',
      }
    );
    expect(billing.getBalance).toHaveBeenCalledWith('billing-project');
  });
});
