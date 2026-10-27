import type { AuthorizationContext } from '../../idp';
import { AccessValidationException } from '../../common/exceptions/access-validation.exception';
import { Action, EntityType } from '../services/access-decision';
import { CredentialStorageConsumersService } from './credential-storage-consumers.service';
import { DataStorageType } from './enums/data-storage-type.enum';
import { ValidationResult } from './interfaces/data-storage-access-validator.interface';

const context = {
  projectId: 'project-1',
  userId: 'member-1',
  roles: ['editor'],
} as AuthorizationContext;

const athena = {
  id: 'storage-athena',
  type: DataStorageType.AWS_ATHENA,
  title: 'Athena prod',
  config: { region: 'us-east-1', outputBucket: 's3://results' },
};
const redshift = {
  id: 'storage-redshift',
  type: DataStorageType.AWS_REDSHIFT,
  title: 'Redshift prod',
  config: { region: 'us-east-1', database: 'dev', workgroupName: 'default' },
};

const candidate = {
  definitionId: 'aws-access-key',
  secret: { fields: { secretAccessKey: 'new-secret-access-key' } },
  publicMetadata: { fields: { accessKeyId: 'key-id-1' } },
};

const current = {
  ...candidate,
  secret: { fields: { secretAccessKey: 'old-secret-access-key' } },
};

const storageBinding = (consumerId: string) => ({ consumerType: 'storage', consumerId });

function setup(visible: readonly string[] = [athena.id, redshift.id]) {
  const storages = { find: jest.fn().mockResolvedValue([athena, redshift]) };
  const access = {
    canAccessMany: jest.fn(
      async (_user: string, _roles: string[], _type: EntityType, ids: readonly string[]) =>
        new Map(ids.map(id => [id, visible.includes(id)]))
    ),
  };
  const validator = { validateAccess: jest.fn().mockResolvedValue(ValidationResult.success()) };
  const consumerTitles = { register: jest.fn() };
  const service = new CredentialStorageConsumersService(
    storages as never,
    access as never,
    validator as never,
    consumerTitles as never
  );
  return { service, storages, access, validator, consumerTitles };
}

async function rejection(promise: Promise<unknown>): Promise<AccessValidationException> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown
  );
  expect(error).toBeInstanceOf(AccessValidationException);
  return error as AccessValidationException;
}

describe('CredentialStorageConsumersService.verifyCandidate', () => {
  it("runs each bound Storage's access check with the new values, one at a time", async () => {
    const state = setup();
    let running = 0;
    state.validator.validateAccess.mockImplementation(async () => {
      running += 1;
      expect(running).toBe(1);
      await new Promise(resolve => setImmediate(resolve));
      running -= 1;
      return ValidationResult.success();
    });

    await expect(
      state.service.verifyCandidate(
        context,
        [
          storageBinding(athena.id),
          { consumerType: 'plugin-installation', consumerId: 'installation-1' },
          storageBinding(redshift.id),
        ],
        candidate,
        current
      )
    ).resolves.toBe(2);

    const adapterCredentials = {
      accessKeyId: 'key-id-1',
      secretAccessKey: 'new-secret-access-key',
    };
    expect(state.validator.validateAccess.mock.calls).toEqual([
      [DataStorageType.AWS_ATHENA, athena.config, adapterCredentials],
      [DataStorageType.AWS_REDSHIFT, redshift.config, adapterCredentials],
    ]);
    expect(state.storages.find).toHaveBeenCalledWith(
      expect.objectContaining({ loadEagerRelations: false })
    );
  });

  it('names the Storage that rejects the values and stops there', async () => {
    const state = setup();
    state.validator.validateAccess.mockResolvedValueOnce(
      ValidationResult.failure('Access validation failed', {
        error: 'The security token included in the request is invalid.',
      })
    );

    const error = await rejection(
      state.service.verifyCandidate(
        context,
        [storageBinding(athena.id), storageBinding(redshift.id)],
        candidate,
        current
      )
    );

    expect(error.message).toBe(
      'The new values do not work for Storage "Athena prod": Access validation failed'
    );
    expect(error.errorDetails).toEqual({
      error: 'The security token included in the request is invalid.',
    });
    expect(JSON.stringify({ message: error.message, details: error.errorDetails })).not.toContain(
      'new-secret-access-key'
    );
    expect(state.validator.validateAccess.mock.calls).toEqual([
      [DataStorageType.AWS_ATHENA, athena.config, expect.objectContaining(candidate.secret.fields)],
      [DataStorageType.AWS_ATHENA, athena.config, expect.objectContaining(current.secret.fields)],
    ]);
  });

  it('skips a Storage that rejects the current values too and counts the ones that accept', async () => {
    const state = setup();
    state.validator.validateAccess
      .mockResolvedValueOnce(ValidationResult.failure('Cluster paused'))
      .mockResolvedValueOnce(ValidationResult.failure('Cluster paused'));

    await expect(
      state.service.verifyCandidate(
        context,
        [storageBinding(athena.id), storageBinding(redshift.id)],
        candidate,
        current
      )
    ).resolves.toBe(1);

    expect(state.validator.validateAccess.mock.calls).toEqual([
      [DataStorageType.AWS_ATHENA, athena.config, expect.objectContaining(candidate.secret.fields)],
      [DataStorageType.AWS_ATHENA, athena.config, expect.objectContaining(current.secret.fields)],
      [
        DataStorageType.AWS_REDSHIFT,
        redshift.config,
        expect.objectContaining(candidate.secret.fields),
      ],
    ]);
  });

  it('masks every secret value of the candidate that the validator echoes', async () => {
    const state = setup();
    const privateKey = '-----BEGIN PRIVATE KEY-----\n"abc"\n-----END PRIVATE KEY-----';
    state.validator.validateAccess.mockResolvedValueOnce(
      ValidationResult.failure('Wrong passphrase pass-phrase-1 for loader', {
        error: `Cannot parse ${privateKey}`,
      })
    );

    const error = await rejection(
      state.service.verifyCandidate(
        context,
        [storageBinding(athena.id)],
        {
          definitionId: 'snowflake-key-pair',
          secret: { fields: { privateKey, privateKeyPassphrase: 'pass-phrase-1' } },
          publicMetadata: { fields: { username: 'loader' } },
        },
        current
      )
    );

    expect(error.message).toBe(
      'The new values do not work for Storage "Athena prod": Wrong passphrase *** for loader'
    );
    expect(error.errorDetails).toEqual({ error: 'Cannot parse ***' });
  });

  it('still masks the string values when a field value is not a string', async () => {
    const state = setup();
    state.validator.validateAccess.mockResolvedValueOnce(
      ValidationResult.failure('Key new-secret-access-key refused', { error: 'refused' })
    );

    const error = await rejection(
      state.service.verifyCandidate(
        context,
        [storageBinding(athena.id)],
        {
          ...candidate,
          secret: {
            fields: { secretAccessKey: 'new-secret-access-key', sessionToken: undefined as never },
          },
        },
        current
      )
    );

    expect(error.message).toBe(
      'The new values do not work for Storage "Athena prod": Key *** refused'
    );
    expect(error.errorDetails).toEqual({ error: 'refused' });
  });

  it('does not name a Storage the member cannot see, nor pass on its details', async () => {
    const state = setup([redshift.id]);
    state.validator.validateAccess.mockResolvedValueOnce(
      ValidationResult.failure('Access validation failed', {
        error: 'Access denied to bucket results',
      })
    );

    const error = await rejection(
      state.service.verifyCandidate(context, [storageBinding(athena.id)], candidate, current)
    );

    expect(error.message).toBe(
      'The new values do not work for a Storage that uses this Credential: Access validation failed'
    );
    expect(error.errorDetails).toBeUndefined();
    expect(state.access.canAccessMany).toHaveBeenCalledWith(
      'member-1',
      ['editor'],
      EntityType.STORAGE,
      [athena.id, redshift.id],
      Action.SEE,
      'project-1'
    );
  });

  it('checks nothing and says so when no Storage uses the Credential', async () => {
    const state = setup();

    await expect(
      state.service.verifyCandidate(
        context,
        [{ consumerType: 'plugin-installation', consumerId: 'installation-1' }],
        candidate,
        current
      )
    ).resolves.toBe(0);

    expect(state.storages.find).not.toHaveBeenCalled();
    expect(state.access.canAccessMany).not.toHaveBeenCalled();
    expect(state.validator.validateAccess).not.toHaveBeenCalled();
  });
});

describe('CredentialStorageConsumersService.visibleTitles', () => {
  it('returns the titles of the Storages the member can see, from one batch decision', async () => {
    const state = setup([redshift.id]);

    const titles = await state.service.visibleTitles(context, [
      storageBinding(athena.id),
      storageBinding(redshift.id),
      { consumerType: 'plugin-installation', consumerId: 'installation-1' },
    ]);

    expect([...titles]).toEqual([[redshift.id, 'Redshift prod']]);
    expect(state.access.canAccessMany).toHaveBeenCalledTimes(1);
  });

  it('serves the Storage titles of the Credentials page', async () => {
    const state = setup([redshift.id]);
    state.service.onModuleInit();
    const [[consumerType, lookup]] = state.consumerTitles.register.mock.calls;

    expect(consumerType).toBe('storage');
    await expect(lookup(context, [athena.id, redshift.id])).resolves.toEqual(
      new Map([[redshift.id, 'Redshift prod']])
    );
  });

  it('makes no query without Storage consumers', async () => {
    const state = setup();

    await expect(state.service.visibleTitles(context, [])).resolves.toEqual(new Map());

    expect(state.storages.find).not.toHaveBeenCalled();
    expect(state.access.canAccessMany).not.toHaveBeenCalled();
  });
});
