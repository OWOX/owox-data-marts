jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { BadRequestException } from '@nestjs/common';
import { DataSource, type Repository } from 'typeorm';
import { CREDENTIAL_VALIDATION_ENTITIES } from '../../../test/fixtures/credential-validation-writes';
import { CredentialConsumerBinding } from '../credentials/entities/credential-consumer-binding.entity';
import { CredentialContext } from '../credentials/entities/credential-context.entity';
import { CredentialOwner } from '../credentials/entities/credential-owner.entity';
import { Credential } from '../credentials/entities/credential.entity';
import { CredentialBindingService } from '../credentials/services/credential-binding.service';
import { CredentialDefinitionService } from '../credentials/services/credential-definition.service';
import { CredentialService } from '../credentials/services/credential.service';
import { Context } from '../entities/context.entity';
import type { DataDestination } from '../entities/data-destination.entity';
import { DestinationCredentialType } from '../enums/destination-credential-type.enum';
import { DestinationCredentialUnavailableException } from '../exceptions/destination-credential-unavailable.exception';
import { Action, EntityType } from '../services/access-decision';
import { DataDestinationCredentialsResolver } from './data-destination-credentials-resolver.service';
import { DestinationCredentialBindingService } from './destination-credential-binding.service';
import { destinationCredentialRequirement } from './destination-credential-state';
import { DataDestinationType } from './enums/data-destination-type.enum';

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const WEBHOOK_URL = 'https://chat.googleapis.com/v1/spaces/A/messages?key=k&token=t';

describe('destinationCredentialRequirement', () => {
  function config(configured: boolean) {
    return {
      isClientConfigured: jest.fn().mockReturnValue(configured),
      getScopes: jest
        .fn()
        .mockReturnValue([SHEETS_SCOPE, DRIVE_FILE_SCOPE, 'openid', 'email', 'profile']),
    };
  }

  it('asks a Google Sheets Destination for the Sheets scopes of the destination client, Drive optional', () => {
    const googleOAuthConfig = config(true);

    expect(
      destinationCredentialRequirement(DataDestinationType.GOOGLE_SHEETS, googleOAuthConfig)
    ).toEqual({
      definitionIds: ['google-service-account', 'google-sheets-oauth'],
      scopes: [SHEETS_SCOPE],
    });
    expect(googleOAuthConfig.isClientConfigured).toHaveBeenCalledWith('destination');
    expect(googleOAuthConfig.getScopes).toHaveBeenCalledWith('sheets');
  });

  it('has null scopes while the destination client is not configured', () => {
    expect(
      destinationCredentialRequirement(DataDestinationType.GOOGLE_SHEETS, config(false))
    ).toEqual({
      definitionIds: ['google-service-account', 'google-sheets-oauth'],
      scopes: null,
    });
  });

  it('asks a Google Chat Destination for a webhook and no scopes', () => {
    const googleOAuthConfig = config(true);

    expect(
      destinationCredentialRequirement(DataDestinationType.GOOGLE_CHAT, googleOAuthConfig)
    ).toEqual({ definitionIds: ['google-chat-webhook'], scopes: [] });
    expect(googleOAuthConfig.isClientConfigured).not.toHaveBeenCalled();
  });

  it('refuses a Destination type that binds no Credential', () => {
    expect(() => destinationCredentialRequirement(DataDestinationType.EMAIL, config(true))).toThrow(
      'Destination type EMAIL takes no Credential'
    );
  });
});

describe('DestinationCredentialBindingService', () => {
  let dataSource: DataSource;
  let credentials: Repository<Credential>;
  let bindings: Repository<CredentialConsumerBinding>;
  let access: { canAccess: jest.Mock; canAccessMany: jest.Mock };
  let googleOAuthConfig: { isClientConfigured: jest.Mock; getScopes: jest.Mock };
  let destinationCredentials: DestinationCredentialBindingService;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [...CREDENTIAL_VALIDATION_ENTITIES, CredentialConsumerBinding],
      synchronize: true,
      logging: false,
    });
    await dataSource.initialize();
  });

  afterAll(() => dataSource.destroy());

  beforeEach(async () => {
    for (const entity of [
      CredentialConsumerBinding,
      CredentialContext,
      CredentialOwner,
      Credential,
      Context,
    ]) {
      await dataSource.getRepository(entity).createQueryBuilder().delete().execute();
    }
    credentials = dataSource.getRepository(Credential);
    bindings = dataSource.getRepository(CredentialConsumerBinding);
    const credentialService = new CredentialService(
      credentials,
      bindings,
      dataSource.getRepository(CredentialOwner),
      dataSource.getRepository(CredentialContext),
      {} as never,
      {} as never
    );
    access = {
      canAccess: jest.fn().mockResolvedValue(true),
      canAccessMany: jest.fn(
        async (_userId: string, _roles: string[], _type: EntityType, ids: string[]) =>
          new Map(ids.map(id => [id, true]))
      ),
    };
    googleOAuthConfig = {
      isClientConfigured: jest.fn().mockReturnValue(true),
      getScopes: jest.fn().mockReturnValue([SHEETS_SCOPE, 'openid', 'email', 'profile']),
    };
    destinationCredentials = new DestinationCredentialBindingService(
      new CredentialBindingService(
        bindings,
        credentials,
        dataSource.getRepository(CredentialContext),
        access as never,
        credentialService
      ),
      new CredentialDefinitionService({} as never, {} as never),
      access as never,
      credentialService,
      { getOAuth2Client: jest.fn() } as never,
      googleOAuthConfig as never
    );
  });

  function givenCredential(overrides: Partial<Credential> = {}): Promise<Credential> {
    return credentials.save(
      credentials.create({
        projectId: 'project-1',
        title: 'Reports key',
        definitionSource: 'builtin',
        definitionId: 'google-service-account',
        secret: { value: 'service-account-key' },
        publicMetadata: {
          clientEmail: 'writer@reports.iam.gserviceaccount.com',
          projectId: 'reports',
          privateKeyId: 'key-1',
        },
        ...overrides,
      })
    );
  }

  function givenSheetsAccount(scopes: string[]): Promise<Credential> {
    return givenCredential({
      title: 'Ann at Google',
      definitionId: 'google-sheets-oauth',
      secret: {
        oauth: {
          provider: 'google',
          clientId: 'destination-client',
          tokens: { access_token: 'access', token_type: 'Bearer', scope: scopes.join(' ') },
        },
      },
      publicMetadata: { account: { email: 'ann@example.com', name: 'Ann', picture: null }, scopes },
    });
  }

  function bind(
    credentialId: string,
    destinationId = 'destination-1',
    type = DataDestinationType.GOOGLE_SHEETS
  ) {
    return destinationCredentials.bindDestination({
      projectId: 'project-1',
      userId: 'member-1',
      roles: ['editor'],
      destinationId,
      type,
      credentialId,
    });
  }

  it('binds a Destination through one destination requirement', async () => {
    const credential = await givenCredential();

    await bind(credential.id);

    expect(
      await bindings.find({ where: { consumerType: 'destination', consumerId: 'destination-1' } })
    ).toEqual([
      expect.objectContaining({
        credentialId: credential.id,
        requirementKey: 'destination',
        requirementSnapshot: {
          definitionIds: ['google-service-account', 'google-sheets-oauth'],
          scopes: [SHEETS_SCOPE],
        },
        active: true,
      }),
    ]);
    expect(access.canAccess).toHaveBeenCalledWith(
      'member-1',
      ['editor'],
      EntityType.CREDENTIAL,
      credential.id,
      Action.USE,
      'project-1'
    );
  });

  it('refuses a Credential of a definition the Destination type does not take', async () => {
    const credential = await givenCredential();

    await expect(
      bind(credential.id, 'destination-1', DataDestinationType.GOOGLE_CHAT)
    ).rejects.toThrow(
      new BadRequestException('This Credential cannot be used with this Destination type.')
    );
    expect(await bindings.count()).toBe(0);
  });

  it('resolves the bound webhook Credential, and nothing once the binding is deactivated', async () => {
    const credential = await givenCredential({
      title: 'Team space',
      definitionId: 'google-chat-webhook',
      secret: { fields: { webhookUrl: WEBHOOK_URL } },
      publicMetadata: { fields: {} },
    });
    await bind(credential.id, 'destination-chat', DataDestinationType.GOOGLE_CHAT);
    const destination = {
      id: 'destination-chat',
      projectId: 'project-1',
      type: DataDestinationType.GOOGLE_CHAT,
    };

    await expect(destinationCredentials.resolveForDestination(destination)).resolves.toEqual(
      expect.objectContaining({
        credentialId: credential.id,
        definitionId: 'google-chat-webhook',
        state: 'ready',
        secret: { fields: { webhookUrl: WEBHOOK_URL } },
      })
    );

    await destinationCredentials.deactivateDestination('destination-chat');
    await expect(destinationCredentials.resolveForDestination(destination)).resolves.toBeNull();
  });

  it('summarizes the bound Credentials as the member sees them, with the Sheets scope state', async () => {
    const key = await givenCredential();
    const account = await givenSheetsAccount(['openid', 'email']);
    await bind(key.id, 'destination-key');
    await bind(account.id, 'destination-account');
    access.canAccessMany.mockResolvedValue(
      new Map([
        [key.id, true],
        [account.id, false],
      ])
    );

    const summaries = await destinationCredentials.summarizeForDestinations({
      projectId: 'project-1',
      userId: 'member-1',
      roles: ['editor'],
      destinations: [
        { id: 'destination-key', type: DataDestinationType.GOOGLE_SHEETS },
        { id: 'destination-account', type: DataDestinationType.GOOGLE_SHEETS },
        { id: 'destination-unbound', type: DataDestinationType.GOOGLE_SHEETS },
      ],
    });

    expect(Object.fromEntries(summaries)).toEqual({
      'destination-key': {
        access: 'visible',
        id: key.id,
        title: 'Reports key',
        definitionId: 'google-service-account',
        providerName: 'Google Service Account',
        identity: 'writer@reports.iam.gserviceaccount.com',
        state: 'ready',
      },
      'destination-account': { access: 'restricted', state: 'reauthorize-required' },
    });
  });

  it.each([
    ['ready without drive.file', [SHEETS_SCOPE], 'ready'],
    ['reauthorize-required without spreadsheets', [DRIVE_FILE_SCOPE], 'reauthorize-required'],
  ])('finds a Sheets Google account %s', async (_case, granted, state) => {
    googleOAuthConfig.getScopes.mockReturnValue([
      SHEETS_SCOPE,
      DRIVE_FILE_SCOPE,
      'openid',
      'email',
      'profile',
    ]);
    const account = await givenSheetsAccount(['openid', 'email', ...granted]);
    await bind(account.id);

    await expect(
      destinationCredentials.resolveForDestination({
        id: 'destination-1',
        projectId: 'project-1',
        type: DataDestinationType.GOOGLE_SHEETS,
      })
    ).resolves.toMatchObject({ state });
  });

  it('keeps a Destination whose bound Credential was deleted off its old row', async () => {
    const credential = await givenCredential();
    await bind(credential.id);
    await credentials.softDelete({ id: credential.id });
    const resolver = new DataDestinationCredentialsResolver(destinationCredentials);
    const destination = {
      id: 'destination-1',
      projectId: 'project-1',
      type: DataDestinationType.GOOGLE_SHEETS,
      credential: {
        type: DestinationCredentialType.GOOGLE_SERVICE_ACCOUNT,
        credentials: { type: 'google-sheets-credentials', serviceAccountKey: { old: true } },
      },
    } as unknown as DataDestination;

    // Typed, so the report writers do not read it as a Google 404.
    await expect(resolver.resolve(destination)).rejects.toEqual(
      new DestinationCredentialUnavailableException(
        "This Destination's Credential was deleted. Select another Credential for this Destination.",
        false
      )
    );
    await expect(
      resolver.summarize('project-1', 'member-1', ['editor'], [destination])
    ).resolves.toEqual(new Map());
    await expect(resolver.boundDefinitionId(destination)).rejects.toEqual(
      new DestinationCredentialUnavailableException(
        "This Destination's Credential was deleted. Select another Credential for this Destination.",
        false
      )
    );
  });

  it('reads the bound definition without loading the secret', async () => {
    const account = await givenSheetsAccount([SHEETS_SCOPE]);
    await bind(account.id);
    const resolve = jest.spyOn(CredentialBindingService.prototype, 'resolve');

    await expect(
      destinationCredentials.boundDefinitionIdOfDestination({
        id: 'destination-1',
        projectId: 'project-1',
      })
    ).resolves.toBe('google-sheets-oauth');
    await expect(
      destinationCredentials.boundDefinitionIdOfDestination({
        id: 'unbound',
        projectId: 'project-1',
      })
    ).resolves.toBeNull();
    expect(resolve).not.toHaveBeenCalled();
    resolve.mockRestore();
  });

  it('names the account of each bound Destination', async () => {
    const account = await givenSheetsAccount([SHEETS_SCOPE]);
    await bind(account.id);

    await expect(
      destinationCredentials.identitiesForDestinations('project-1', ['destination-1', 'other'])
    ).resolves.toEqual(new Map([['destination-1', 'ann@example.com']]));
    await expect(
      destinationCredentials.findBoundDestinationIds('project-1', ['destination-1', 'other'])
    ).resolves.toEqual(new Set(['destination-1']));
  });

  it('lists a binding whose Credential was deleted with a null identity only when asked', async () => {
    const credential = await givenCredential();
    await bind(credential.id);
    await credentials.softDelete({ id: credential.id });

    await expect(
      destinationCredentials.identitiesForDestinations('project-1', ['destination-1'], true)
    ).resolves.toEqual(new Map([['destination-1', null]]));
    await expect(
      destinationCredentials.identitiesForDestinations('project-1', ['destination-1'])
    ).resolves.toEqual(new Map());
  });

  it('reads the bound Credential id without a lock, null when unbound', async () => {
    await expect(
      destinationCredentials.boundCredentialIdOfDestination('project-1', 'destination-1')
    ).resolves.toBeNull();
    const credential = await givenCredential();
    await bind(credential.id);

    await expect(
      destinationCredentials.boundCredentialIdOfDestination('project-1', 'destination-1')
    ).resolves.toBe(credential.id);
  });
});
