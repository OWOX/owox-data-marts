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
  const mapper = new DataDestinationMapper(
    null as never,
    null as never,
    null as never,
    null as never
  );
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
  const mapper = new DataDestinationMapper(
    null as never,
    null as never,
    null as never,
    null as never
  );
  const context = {
    projectId: 'proj-1',
    userId: 'user-1',
    roles: ['viewer'],
  } as never;

  it('builds a connect-flow command that starts unshared and links the OAuth credential', () => {
    const command = mapper.toConnectGoogleSheetsCreateCommand(context, {
      title: 'Google Sheets (user@example.com)',
      credentialId: 'cred-oauth-1',
    });

    expect(command).toMatchObject({
      projectId: 'proj-1',
      userId: 'user-1',
      roles: ['viewer'],
      title: 'Google Sheets (user@example.com)',
      type: DataDestinationType.GOOGLE_SHEETS,
      credentials: undefined,
      credentialId: 'cred-oauth-1',
      sourceDestinationId: undefined,
      ownerIds: undefined,
      config: undefined,
      availableForUse: false,
    });
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
      null as never,
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
      null as never,
      { getLookerStudioDeploymentUrl: () => 'https://owox.example/looker' } as never,
      { getById: async () => LOOKER_CREDENTIAL } as never,
      { isActive: () => false, get: () => undefined } as never
    );

    await expect(mapper.toApiResponse(destination)).resolves.toMatchObject({
      credentials: expect.objectContaining({ destinationSecretKey: 'sk_live_do_not_leak' }),
    });
  });
});

describe('DataDestinationMapper - Google Chat credential redaction', () => {
  it('never returns the secret incoming webhook URL', async () => {
    const webhookUrl =
      'https://chat.googleapis.com/v1/spaces/space-1/messages?key=key-1&token=secret-token';
    const credentialService = {
      getById: jest.fn().mockResolvedValue({
        type: DestinationCredentialType.GOOGLE_CHAT_WEBHOOK,
        credentials: { type: 'google-chat-credentials', webhookUrl },
      }),
    };
    const mapper = new DataDestinationMapper(
      null as never,
      null as never,
      credentialService as never,
      null as never
    );
    const dto = new DataDestinationDto(
      'destination-1',
      'Marketing Chat',
      DataDestinationType.GOOGLE_CHAT,
      'project-1',
      new Date('2026-07-17T12:00:00Z'),
      new Date('2026-07-17T12:00:00Z'),
      'credential-1'
    );

    const response = await mapper.toApiResponse(dto);

    expect(response.credentials).toEqual({
      type: 'google-chat-credentials',
      configured: true,
    });
    expect(JSON.stringify(response)).not.toContain(webhookUrl);
    expect(JSON.stringify(response)).not.toContain('secret-token');
  });
});
