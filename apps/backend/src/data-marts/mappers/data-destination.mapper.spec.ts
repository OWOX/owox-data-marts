import { BadRequestException } from '@nestjs/common';
import { DataDestinationMapper } from './data-destination.mapper';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { DataDestinationDto } from '../dto/domain/data-destination.dto';
import { DestinationCredentialType } from '../enums/destination-credential-type.enum';

/**
 * `normalizeDestinationConfig` is exercised through the public `toCreateCommand`.
 * It only reads the DTO (no injected services are used on this path), so the
 * mapper can be constructed with stub dependencies.
 */
describe('DataDestinationMapper - destination config normalization', () => {
  const mapper = new DataDestinationMapper(null as never, null as never, null as never);
  const context = { projectId: 'proj-1', userId: 'user-1', roles: [] } as never;
  const dtoWithConfig = (config: unknown) =>
    ({ title: 'Dest', type: DataDestinationType.GOOGLE_SHEETS, config }) as never;

  it('derives folderId from a valid Drive folder URL', () => {
    const command = mapper.toCreateCommand(
      context,
      dtoWithConfig({ folderUrl: 'https://drive.google.com/drive/folders/ABC123' })
    );

    expect(command.config).toEqual({
      folderUrl: 'https://drive.google.com/drive/folders/ABC123',
      folderId: 'ABC123',
    });
  });

  it('rejects a non-empty folder URL that yields no folder id', () => {
    expect(() =>
      mapper.toCreateCommand(context, dtoWithConfig({ folderUrl: 'not a folder ###' }))
    ).toThrow(BadRequestException);
  });

  it('returns nulls when the folder URL is cleared', () => {
    const command = mapper.toCreateCommand(context, dtoWithConfig({ folderUrl: '' }));

    expect(command.config).toEqual({ folderUrl: null, folderId: null });
  });

  it('leaves config untouched (undefined) when none is sent', () => {
    const command = mapper.toCreateCommand(context, dtoWithConfig(undefined));

    expect(command.config).toBeUndefined();
  });
});

describe('DataDestinationMapper - MCP connect Google Sheets flow', () => {
  const mapper = new DataDestinationMapper(null as never, null as never, null as never);
  const context = {
    projectId: 'proj-1',
    userId: 'user-1',
    roles: ['viewer'],
  } as never;

  it('builds a connect-flow command that starts unshared and binds the Credential', () => {
    const command = mapper.toConnectGoogleSheetsCreateCommand(context, {
      title: 'Google Sheets (user@example.com)',
      reusableCredentialId: 'credential-1',
    });

    expect(command).toMatchObject({
      projectId: 'proj-1',
      userId: 'user-1',
      roles: ['viewer'],
      title: 'Google Sheets (user@example.com)',
      type: DataDestinationType.GOOGLE_SHEETS,
      credentials: undefined,
      reusableCredentialId: 'credential-1',
      sentOldCredentialFields: false,
      isPluginCall: false,
      ownerIds: undefined,
      config: undefined,
      availableForUse: false,
    });
  });

  it('marks a connect request from an older page that still sends credentialId', () => {
    const command = mapper.toConnectGoogleSheetsCreateCommand(context, {
      title: 'Google Sheets (user@example.com)',
      credentialId: 'row-1',
    } as never);

    expect(command.sentOldCredentialFields).toBe(true);
  });
});

/**
 * A plugin runs as untrusted third-party code holding the member's own authority, so
 * anything it reads it can forward to its vendor. Business data is accepted collateral of
 * that design; a stored credential is not. Looker Studio is the case that matters -- its
 * destination keeps a secret key, and the member-facing UI shows it because the member has
 * to paste it into Looker Studio.
 */
describe('DataDestinationMapper - credentials withheld from a plugin runtime', () => {
  const LOOKER_CREDENTIAL = {
    type: DestinationCredentialType.LOOKER_STUDIO,
    credentials: {
      type: 'looker-studio-credentials',
      destinationSecretKey: 'sk_live_do_not_leak',
      deploymentUrl: 'https://script.google.com/macros/s/example/exec',
    },
  };

  const setup = (authFlow?: string) => {
    const cls = {
      isActive: () => true,
      get: () => ({ authFlow, userId: 'user-1', projectId: 'proj-1' }),
    };

    return new DataDestinationMapper(
      { getLookerStudioDeploymentUrl: () => 'https://owox.example/looker' } as never,
      { getById: async () => LOOKER_CREDENTIAL } as never,
      cls as never
    );
  };

  const destination = {
    id: 'dest-1',
    title: 'Looker Studio',
    type: DataDestinationType.LOOKER_STUDIO,
    projectId: 'proj-1',
    credentialId: 'cred-1',
    createdAt: new Date('2026-01-01'),
    modifiedAt: new Date('2026-01-01'),
  } as never;

  it('returns no credentials at all to a plugin runtime token', async () => {
    const response = await setup('plugin').toApiResponse(destination);

    expect(response.credentials).toEqual({});
    expect(JSON.stringify(response)).not.toContain('sk_live_do_not_leak');
    // Everything else still answers: a plugin may list destinations, just not their keys.
    expect(response).toMatchObject({ id: 'dest-1', title: 'Looker Studio' });
  });

  it.each([['api_key'], [undefined]])(
    'still returns the secret key to a %s caller, which the destination UI needs',
    async authFlow => {
      const response = await setup(authFlow).toApiResponse(destination);

      expect(response.credentials).toMatchObject({ destinationSecretKey: 'sk_live_do_not_leak' });
    }
  );

  it('withholds nothing when there is no request context to read', async () => {
    const mapper = new DataDestinationMapper(
      { getLookerStudioDeploymentUrl: () => 'https://owox.example/looker' } as never,
      { getById: async () => LOOKER_CREDENTIAL } as never,
      { isActive: () => false, get: () => undefined } as never
    );

    await expect(mapper.toApiResponse(destination)).resolves.toMatchObject({
      credentials: expect.objectContaining({ destinationSecretKey: 'sk_live_do_not_leak' }),
    });
  });
});

describe('DataDestinationMapper - a Google Chat Destination inside a report', () => {
  const dto = (credentialId: string) =>
    new DataDestinationDto(
      'destination-1',
      'Marketing Chat',
      DataDestinationType.GOOGLE_CHAT,
      'project-1',
      new Date('2026-07-17T12:00:00Z'),
      new Date('2026-07-17T12:00:00Z'),
      credentialId
    );
  const mapperWith = (row: unknown, authFlow?: string) =>
    new DataDestinationMapper(
      null as never,
      { getById: jest.fn().mockResolvedValue(row) } as never,
      { isActive: () => true, get: () => ({ authFlow }) } as never
    );

  it('returns only that a webhook is configured, and no id, for an old webhook row', async () => {
    const webhookUrl =
      'https://chat.googleapis.com/v1/spaces/space-1/messages?key=key-1&token=secret-token';
    const row = {
      type: DestinationCredentialType.GOOGLE_CHAT_WEBHOOK,
      credentials: { type: 'google-chat-credentials', webhookUrl },
    };

    const response = await mapperWith(row).toApiResponse(dto('row-webhook'));

    expect(response.credentials).toEqual({ type: 'google-chat-credentials', configured: true });
    expect(response).not.toHaveProperty('credentialId');
    expect(JSON.stringify(response)).not.toContain('secret-token');
    expect(await mapperWith(row, 'plugin').toApiResponse(dto('row-webhook'))).toMatchObject({
      credentials: {},
    });
  });

  it('keeps the email recipients and their id', async () => {
    const credentials = { type: 'email-credentials', to: ['space@example.com'] };

    const response = await mapperWith({
      type: DestinationCredentialType.EMAIL,
      credentials,
    }).toApiResponse(dto('row-email'));

    expect(response.credentials).toEqual(credentials);
    expect(response.credentialId).toBe('row-email');
  });
});

describe('DataDestinationMapper.toByTypeCommand', () => {
  const context = { projectId: 'proj-1', userId: 'user-1', roles: ['editor'] } as never;

  it.each([
    ['a member', undefined, false],
    ['a plugin', 'plugin', true],
  ])('carries the project and whether %s calls', (_who, authFlow, isPluginCall) => {
    const cls = { isActive: () => true, get: () => ({ authFlow }) };
    const mapper = new DataDestinationMapper(null as never, null as never, cls as never);

    expect(mapper.toByTypeCommand(context, DataDestinationType.GOOGLE_SHEETS)).toEqual({
      projectId: 'proj-1',
      type: DataDestinationType.GOOGLE_SHEETS,
      isPluginCall,
    });
  });
});

describe('DataDestinationMapper - commands carry the Credential fields', () => {
  const context = { projectId: 'proj-1', userId: 'user-1', roles: ['editor'] } as never;
  const mapperFor = (authFlow?: string) =>
    new DataDestinationMapper(
      null as never,
      null as never,
      {
        isActive: () => true,
        get: () => ({ authFlow }),
      } as never
    );

  it('flags the fields an older page sends and a plugin call on create', () => {
    const command = mapperFor('plugin').toCreateCommand(context, {
      title: 'Sheets',
      type: DataDestinationType.GOOGLE_SHEETS,
      reusableCredentialId: 'credential-1',
      sourceDestinationId: 'dest-2',
    } as never);

    expect(command).toMatchObject({
      reusableCredentialId: 'credential-1',
      sentOldCredentialFields: true,
      isPluginCall: true,
    });
  });

  it('flags a credentialId sent as null on update', () => {
    const command = mapperFor().toUpdateCommand('dest-1', context, {
      title: 'Sheets',
      credentialId: null,
    } as never);

    expect(command).toMatchObject({
      reusableCredentialId: undefined,
      sentOldCredentialFields: true,
      isPluginCall: false,
    });
  });
});

describe('DataDestinationMapper - the Credential a Destination selects', () => {
  const visible = {
    access: 'visible' as const,
    id: 'credential-1',
    title: 'Docs writer',
    definitionId: 'google-service-account',
    providerName: 'Google Service Account',
    identity: 'docs@acme.iam.gserviceaccount.com',
    state: 'ready' as const,
  };
  const emailRow = {
    type: DestinationCredentialType.EMAIL,
    credentials: { type: 'email-credentials', to: ['space@example.com'] },
  };

  const mapperFor = (authFlow?: string, row: unknown = emailRow) =>
    new DataDestinationMapper(
      null as never,
      { getById: jest.fn().mockResolvedValue(row) } as never,
      { isActive: () => true, get: () => ({ authFlow }) } as never
    );

  const entity = (
    type: DataDestinationType,
    credentialId: string | null = null,
    credential: { type: DestinationCredentialType } | null = null
  ) =>
    ({
      id: 'dest-1',
      title: 'Destination',
      type,
      projectId: 'proj-1',
      credentialId,
      credential,
      createdAt: new Date('2026-10-27'),
      modifiedAt: new Date('2026-10-27'),
      ownerIds: [],
    }) as never;

  async function respond(
    type: DataDestinationType,
    credentialId: string | null,
    summaries?: Map<string, unknown>,
    authFlow?: string
  ) {
    const mapper = mapperFor(authFlow, emailRow);
    return mapper.toApiResponse(
      mapper.toDomainDto(entity(type, credentialId), null, [], summaries as never)
    );
  }

  const serviceAccount = {
    type: 'google-sheets-credentials',
    serviceAccountKey: {
      type: 'service_account',
      project_id: 'acme',
      client_email: visible.identity,
    },
  };
  const googleAccount = {
    type: 'google-sheets-oauth-credentials',
    identity: { email: 'ann@example.com', name: 'Ann' },
  };
  const webhook = { type: 'google-chat-credentials', configured: true };

  it('returns a Google Sheets Credential field by field, with its public credentials', async () => {
    const response = await respond(
      DataDestinationType.GOOGLE_SHEETS,
      'row-old',
      new Map([['dest-1', { ...visible, secret: 'never', credentials: serviceAccount }]])
    );

    expect(response.reusableCredential).toEqual(visible);
    expect(response.credentials).toEqual(serviceAccount);
    expect(response).not.toHaveProperty('credentialId');
    expect(JSON.stringify(response)).not.toContain('never');
  });

  it('returns the public credentials of a restricted Credential, with its provider and address', async () => {
    const response = await respond(
      DataDestinationType.GOOGLE_SHEETS,
      null,
      new Map([
        [
          'dest-1',
          {
            access: 'restricted',
            state: 'ready',
            identity: visible.identity,
            definitionId: 'google-service-account',
            credentials: serviceAccount,
          },
        ],
      ])
    );

    expect(response.reusableCredential).toEqual({
      access: 'restricted',
      state: 'ready',
      identity: visible.identity,
      definitionId: 'google-service-account',
    });
    expect(response.credentials).toEqual(serviceAccount);
  });

  it('returns the Google account of a bound Sheets Credential and of a pending old row', async () => {
    const bound = await respond(
      DataDestinationType.GOOGLE_SHEETS,
      null,
      new Map([['dest-1', { ...visible, credentials: googleAccount }]])
    );
    const pending = await respond(
      DataDestinationType.GOOGLE_SHEETS,
      'row-old',
      new Map([
        [
          'dest-1',
          {
            access: 'pending',
            state: 'ready',
            identity: 'ann@example.com',
            definitionId: 'google-sheets-oauth',
            credentials: googleAccount,
          },
        ],
      ])
    );

    expect(bound.credentials).toEqual(googleAccount);
    expect(pending.credentials).toEqual(googleAccount);
    expect(pending.reusableCredential).toMatchObject({ definitionId: 'google-sheets-oauth' });
  });

  it('names only the address to share a sheet with for a restricted Credential', async () => {
    const response = await respond(
      DataDestinationType.GOOGLE_SHEETS,
      null,
      new Map([['dest-1', { ...visible, access: 'restricted', state: 'disabled' }]])
    );

    expect(response.reusableCredential).toEqual({
      access: 'restricted',
      state: 'disabled',
      identity: visible.identity,
      definitionId: visible.definitionId,
    });
  });

  it('names nothing for a restricted Credential without an identity', async () => {
    const response = await respond(
      DataDestinationType.GOOGLE_CHAT,
      null,
      new Map([['dest-1', { access: 'restricted', state: 'ready' }]])
    );

    expect(response.reusableCredential).toEqual({ access: 'restricted', state: 'ready' });
  });

  it('says a Google Sheets Destination on its own key is pending, with its address', async () => {
    const response = await respond(
      DataDestinationType.GOOGLE_SHEETS,
      'row-old',
      new Map([['dest-1', { access: 'pending', state: 'ready', identity: 'ann@example.com' }]])
    );

    expect(response.reusableCredential).toEqual({
      access: 'pending',
      state: 'ready',
      identity: 'ann@example.com',
    });
  });

  it('returns null and {} for a Google Sheets Destination without a summary: its Credential is gone, or it has neither', async () => {
    const response = await respond(DataDestinationType.GOOGLE_SHEETS, 'row-old', new Map());

    expect(response.reusableCredential).toBeNull();
    expect(response.credentials).toEqual({});
    expect(response).not.toHaveProperty('credentialId');
  });

  it('returns a Google Chat webhook Credential with only that it is configured', async () => {
    const response = await respond(
      DataDestinationType.GOOGLE_CHAT,
      null,
      new Map([
        [
          'dest-1',
          { ...visible, definitionId: 'google-chat-webhook', identity: null, credentials: webhook },
        ],
      ])
    );

    expect(response.reusableCredential).toMatchObject({ access: 'visible', id: 'credential-1' });
    expect(response.credentials).toEqual(webhook);
  });

  it('says a Google Chat Destination on an old webhook row is pending, with a configured webhook', async () => {
    const response = await respond(
      DataDestinationType.GOOGLE_CHAT,
      'row-webhook',
      new Map([['dest-1', { access: 'pending', state: 'ready', credentials: webhook }]])
    );

    expect(response.reusableCredential).toEqual({ access: 'pending', state: 'ready' });
    expect(response.credentials).toEqual(webhook);
    expect(response).not.toHaveProperty('credentialId');
  });

  it('returns null for a Google Chat Destination whose webhook row has no summary', async () => {
    const mapper = mapperFor();
    const credential = { type: DestinationCredentialType.GOOGLE_CHAT_WEBHOOK };

    const response = await mapper.toApiResponse(
      mapper.toDomainDto(
        entity(DataDestinationType.GOOGLE_CHAT, 'row-webhook', credential),
        null,
        [],
        new Map()
      )
    );

    expect(response.reusableCredential).toBeNull();
    expect(response.credentials).toEqual({});
    expect(response).not.toHaveProperty('credentialId');
  });

  it('returns Google Chat email recipients as before, with no Credential', async () => {
    const response = await respond(DataDestinationType.GOOGLE_CHAT, 'row-email', new Map());

    expect(response.credentials).toEqual(emailRow.credentials);
    expect(response.credentialId).toBe('row-email');
    expect(response).not.toHaveProperty('reusableCredential');
  });

  it('gives a plugin empty credentials and no Credential', async () => {
    const response = await respond(
      DataDestinationType.GOOGLE_SHEETS,
      null,
      new Map([['dest-1', { ...visible, credentials: serviceAccount }]]),
      'plugin'
    );

    expect(response.credentials).toEqual({});
    expect(response).not.toHaveProperty('reusableCredential');
  });

  it('reads neither a Credential nor an old row for a Destination its caller summarized', async () => {
    const getById = jest.fn();
    const mapper = new DataDestinationMapper(
      null as never,
      { getById } as never,
      { isActive: () => true, get: () => ({}) } as never
    );
    const summaries = new Map([['dest-1', { ...visible, credentials: serviceAccount }]]);

    const sheets = await mapper.toApiResponse(
      mapper.toDomainDto(
        entity(DataDestinationType.GOOGLE_SHEETS, 'row-old'),
        null,
        [],
        summaries as never
      )
    );
    await mapper.toApiResponse(
      mapper.toDomainDto(entity(DataDestinationType.GOOGLE_CHAT), null, [], new Map())
    );

    expect(sheets.credentials).toEqual(serviceAccount);
    expect(getById).not.toHaveBeenCalled();
  });

  it('adds no Credential to other types', async () => {
    const response = await respond(DataDestinationType.EMAIL, 'row-email', new Map());

    expect(response).not.toHaveProperty('reusableCredential');
    expect(response.credentials).toEqual(emailRow.credentials);
  });
});
