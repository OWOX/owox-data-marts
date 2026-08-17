import { RunKind } from '../../../data-marts/services/project-billing/project-billing.service';
import { LicenseGatewayController } from './license-gateway.controller';

describe('LicenseGatewayController', () => {
  const licenseKey = {
    projectId: 'billing-project',
    licenseKeyId: 'key-1',
    name: 'Production',
    origin: 'https://customer.test',
  };

  const createController = (configured = true, forwardedConfigured = true) => {
    const assertForwardedConsumptionConfigured = jest.fn();
    if (!forwardedConfigured) {
      assertForwardedConsumptionConfigured.mockImplementation(() => {
        throw new Error('forwarded consumption is not configured');
      });
    }
    const billing = {
      isBalanceConfigured: jest.fn().mockReturnValue(configured),
      assertForwardedConsumptionConfigured,
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

  it('fails startup without complete forwarded consumption configuration', () => {
    expect(() => createController(true, false)).toThrow('forwarded consumption is not configured');
  });

  it('validates forwarded consumption configuration at startup', () => {
    const { billing } = createController();

    expect(billing.assertForwardedConsumptionConfigured).toHaveBeenCalledTimes(1);
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

  it('does not acknowledge consumption when PubSub publication fails', async () => {
    const { controller, billing } = createController();
    billing.publishForwardedConsumption.mockRejectedValue(new Error('pubsub unavailable'));

    await expect(
      controller.consumption({ licenseKey } as never, {
        kind: RunKind.MCP_QUERY_RUN,
        payload: { runId: 'run-1' },
      })
    ).rejects.toThrow('pubsub unavailable');
  });
});
