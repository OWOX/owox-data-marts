import { BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { Core } from '@owox/connectors';
import { TestCustomConnectorCommand } from '../../dto/domain/test-custom-connector.command';
import { SourceCredentialUnavailableException } from '../../exceptions/source-credential-unavailable.exception';
import { ROTATION_LEASE_BUSY } from '../../services/connector/source-credential-injector.service';
import { TestCustomConnectorService } from './test-custom-connector.service';

const { GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD } = Core;

const manifest = {
  version: '1.0',
  name: 'BasicApi',
  baseUrl: 'https://api.example.com',
  authentication: {
    type: 'basic',
    username: '{{ parameters.User }}',
    password: '{{ parameters.Pass }}',
  },
  parameters: {
    User: { requiredType: 'string', isRequired: true, label: 'User' },
    Pass: { requiredType: 'string', isRequired: true, label: 'Pass' },
    Region: { requiredType: 'string' },
  },
  nodes: {
    items: {
      fields: { id: { type: 'string' } },
      uniqueKeys: ['id'],
      request: { method: 'GET', path: '/items' },
      recordSelector: { recordPath: [] },
    },
  },
};

describe('TestCustomConnectorService', () => {
  const make = () => {
    const tests = {
      runTest: jest.fn(),
      pruneToNode: jest.fn((m: Record<string, unknown>) => m),
    };
    const sourceCredentials = {
      checkConfigCredential: jest.fn().mockResolvedValue(undefined),
      resolveCredential: jest.fn().mockResolvedValue({ credentialId: 'cred-1' }),
    };
    const injector = {
      leaseRotation: jest.fn(
        async (credential: unknown): Promise<{ credential: unknown; leaseId?: string }> => ({
          credential,
        })
      ),
      testValues: jest.fn().mockReturnValue({
        parameters: { User: 'u', Pass: 'p' },
        keyParameters: ['User', 'Pass'],
        expected: { [GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD]: 'old' },
        values: ['u', 'p'],
      }),
    };
    const credentials = {
      updateSecretFields: jest.fn().mockResolvedValue({ updated: true }),
      releaseRotation: jest.fn().mockResolvedValue(undefined),
    };
    const service = new TestCustomConnectorService(
      tests as never,
      sourceCredentials as never,
      injector as never,
      credentials as never
    );
    /** The runner reports a rotated token, as a token-refreshing connector does. */
    const rotating = () =>
      tests.runTest.mockImplementation(async args => {
        args.credential.onRotated({ [GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD]: 'new-token' });
        return { rows: [], logs: [] };
      });
    return { service, tests, sourceCredentials, injector, credentials, rotating };
  };

  const input = (configuration: Record<string, unknown> = {}) => ({
    manifest,
    node: 'items',
    configuration,
  });
  const withCredential = (configuration?: Record<string, unknown>) =>
    new TestCustomConnectorCommand('proj-1', input(configuration), {
      credentialId: 'cred-1',
      userId: 'user-1',
      roles: ['editor'],
    });

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  it('runs typed values as they are when no Credential is chosen', async () => {
    const { service, tests, sourceCredentials } = make();
    tests.runTest.mockResolvedValue({ rows: [], logs: [] });

    await service.run(new TestCustomConnectorCommand('proj-1', input({ User: 'typed' })));

    expect(tests.runTest).toHaveBeenCalledWith({
      ...input({ User: 'typed' }),
      projectId: 'proj-1',
    });
    expect(sourceCredentials.checkConfigCredential).not.toHaveBeenCalled();
  });

  it('runs on the Credential values and hands the runner only the key parameters to hide', async () => {
    const { service, tests, sourceCredentials } = make();
    tests.runTest.mockResolvedValue({ rows: [{ id: '1' }], logs: [] });

    const result = await service.run(withCredential({ Region: 'eu' }));

    expect(sourceCredentials.checkConfigCredential).toHaveBeenCalledWith(
      expect.objectContaining({ credentialId: 'cred-1', connectorName: 'BasicApi' })
    );
    expect(tests.runTest).toHaveBeenCalledWith(
      expect.objectContaining({
        configuration: { Region: 'eu', User: 'u', Pass: 'p' },
        credential: expect.objectContaining({
          keyParameters: ['User', 'Pass'],
          values: ['u', 'p'],
        }),
      })
    );
    expect(result.rows).toEqual([{ id: '1' }]);
  });

  it('refuses typed key parameters beside a Credential before any run', async () => {
    const { service, tests } = make();

    await expect(service.run(withCredential({ Pass: 'typed-pass' }))).rejects.toThrow(
      BadRequestException
    );
    expect(tests.runTest).not.toHaveBeenCalled();
  });

  it('refuses a manifest whose run node misuses a key parameter, before any check or run', async () => {
    const { service, tests, sourceCredentials } = make();
    const leaky = {
      ...manifest,
      nodes: {
        items: {
          ...manifest.nodes.items,
          transformations: [{ type: 'add', field: 'label', value: '{{ parameters.Pass }}' }],
        },
      },
    };
    const command = new TestCustomConnectorCommand(
      'proj-1',
      { manifest: leaky, node: 'items', configuration: {} },
      { credentialId: 'cred-1', userId: 'user-1', roles: ['editor'] }
    );

    const refusal = service.run(command);

    await expect(refusal).rejects.toBeInstanceOf(BadRequestException);
    await expect(refusal).rejects.toThrow(
      'Key parameter "Pass" cannot be used in transformations.add of node "items"'
    );
    expect(sourceCredentials.checkConfigCredential).not.toHaveBeenCalled();
    expect(tests.runTest).not.toHaveBeenCalled();
  });

  it.each([
    ['a refused USE', new ForbiddenException('You cannot use this Credential.')],
    [
      'a Credential that does not fit',
      new BadRequestException('This Credential cannot be used with this connector.'),
    ],
  ])('%s stops the test before any read, run or write', async (_name, refusal) => {
    const { service, tests, sourceCredentials, injector, credentials } = make();
    sourceCredentials.checkConfigCredential.mockRejectedValue(refusal);

    await expect(service.run(withCredential())).rejects.toBe(refusal);

    expect(sourceCredentials.resolveCredential).not.toHaveBeenCalled();
    expect(injector.leaseRotation).not.toHaveBeenCalled();
    expect(tests.runTest).not.toHaveBeenCalled();
    expect(credentials.updateSecretFields).not.toHaveBeenCalled();
  });

  it('stores a rotated token on the Credential with the values the run started from', async () => {
    const { service, credentials, rotating } = make();
    rotating();

    const result = await service.run(withCredential());

    expect(credentials.updateSecretFields).toHaveBeenCalledWith(
      'cred-1',
      'proj-1',
      { [GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD]: 'new-token' },
      { [GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD]: 'old' }
    );
    expect(result.logs).toEqual([]);
  });

  it.each([
    ['the Credential changed meanwhile', () => ({ updated: false }), undefined],
    ['the write throws', undefined, new Error('db down')],
  ])('tells the author the rotated token was not saved when %s', async (_name, ok, error) => {
    const { service, credentials, rotating } = make();
    rotating();
    if (error) credentials.updateSecretFields.mockRejectedValue(error);
    else credentials.updateSecretFields.mockResolvedValue(ok!());

    const result = await service.run(withCredential());

    expect(result.logs).toEqual([expect.stringContaining('could not be saved to the Credential')]);
    expect(JSON.stringify(result)).not.toContain('new-token');
  });

  describe('the rotation lease', () => {
    const reread = { credentialId: 'cred-1', definitionId: 'custom-connector' };
    const leased = (made: ReturnType<typeof make>) =>
      made.injector.leaseRotation.mockResolvedValue({ credential: reread, leaseId: 'lease-1' });

    it('runs on the values read under the lease and releases it after storing the rotated token', async () => {
      const made = make();
      leased(made);
      made.rotating();

      await made.service.run(withCredential());

      // At most 5 s, so the test still answers inside the web request's 30 s timeout.
      expect(made.injector.leaseRotation).toHaveBeenCalledWith(
        { credentialId: 'cred-1' },
        expect.any(Function),
        5_000,
        expect.any(Function)
      );
      expect(made.injector.testValues).toHaveBeenCalledWith('BasicApi', {}, manifest, reread);
      expect(made.credentials.releaseRotation).toHaveBeenCalledWith('cred-1', 'lease-1');
      expect(made.credentials.updateSecretFields.mock.invocationCallOrder[0]).toBeLessThan(
        made.credentials.releaseRotation.mock.invocationCallOrder[0]
      );
    });

    it('releases the lease when the test fails', async () => {
      const made = make();
      leased(made);
      made.tests.runTest.mockRejectedValue(new Error('runner crashed'));

      await expect(made.service.run(withCredential())).rejects.toThrow('runner crashed');

      expect(made.credentials.releaseRotation).toHaveBeenCalledWith('cred-1', 'lease-1');
    });

    it('leases a first refresh only for a manifest whose run can rotate the refresh token', async () => {
      const oauth = {
        ...manifest,
        authentication: {
          type: 'oauth2',
          tokenUrl: 'https://oauth.example.com/token',
          clientId: '{{ parameters.User }}',
          clientSecret: '{{ parameters.Pass }}',
          refreshToken: '{{ parameters.Region }}',
          inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
        },
      };
      const rotatesFor = async (m: Record<string, unknown>) => {
        const made = make();
        made.tests.runTest.mockResolvedValue({ rows: [], logs: [] });
        await made.service.run(
          new TestCustomConnectorCommand(
            'proj-1',
            { manifest: m, node: 'items', configuration: {} },
            { credentialId: 'cred-1', userId: 'user-1', roles: ['editor'] }
          )
        );
        const [, , , rotates] = made.injector.leaseRotation.mock.calls[0] as unknown as [
          unknown,
          unknown,
          unknown,
          (credential: unknown) => boolean,
        ];
        return rotates(reread);
      };

      await expect(rotatesFor(manifest)).resolves.toBe(false);
      await expect(rotatesFor(oauth)).resolves.toBe(true);
    });

    it('a lease another run keeps past the wait answers "try again" and runs nothing', async () => {
      const made = make();
      made.injector.leaseRotation.mockRejectedValue(
        new SourceCredentialUnavailableException(ROTATION_LEASE_BUSY)
      );

      const refusal = made.service.run(withCredential());

      await expect(refusal).rejects.toBeInstanceOf(SourceCredentialUnavailableException);
      await expect(refusal).rejects.toThrow(
        "Another run is refreshing this Credential's token. Try again in a minute."
      );
      expect(made.tests.runTest).not.toHaveBeenCalled();
      expect(made.credentials.releaseRotation).not.toHaveBeenCalled();
    });

    it('releases nothing when no lease was taken', async () => {
      const made = make();
      made.rotating();

      await made.service.run(withCredential());

      expect(made.credentials.releaseRotation).not.toHaveBeenCalled();
    });
  });
});
