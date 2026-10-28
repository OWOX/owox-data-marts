import { serviceAccountKey } from '../../../test/fixtures/google-service-account-key';
import type { DataDestination } from '../entities/data-destination.entity';
import { DestinationCredentialType } from '../enums/destination-credential-type.enum';
import { CredentialsExpiredException } from '../exceptions/google-oauth.exceptions';
import { DestinationCredentialUnavailableException } from '../exceptions/destination-credential-unavailable.exception';
import { DataDestinationCredentialsResolver } from './data-destination-credentials-resolver.service';
import type {
  DestinationCredentialBindingService,
  ResolvedDestinationCredential,
} from './destination-credential-binding.service';
import { DataDestinationType } from './enums/data-destination-type.enum';

const WEBHOOK_URL = 'https://chat.googleapis.com/v1/spaces/A/messages?key=k&token=t';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

describe('DataDestinationCredentialsResolver', () => {
  let bindings: jest.Mocked<
    Pick<
      DestinationCredentialBindingService,
      | 'resolveForDestination'
      | 'getGoogleOAuth2Client'
      | 'markDestinationUsed'
      | 'summarizeForDestinations'
      | 'findBoundDestinationIds'
      | 'publicOfDestinations'
      | 'boundDefinitionIdOfDestination'
    >
  >;
  let resolver: DataDestinationCredentialsResolver;

  beforeEach(() => {
    bindings = {
      resolveForDestination: jest.fn().mockResolvedValue(null),
      getGoogleOAuth2Client: jest.fn(),
      markDestinationUsed: jest.fn().mockResolvedValue(undefined),
      summarizeForDestinations: jest.fn().mockResolvedValue(new Map()),
      findBoundDestinationIds: jest.fn().mockResolvedValue(new Set()),
      publicOfDestinations: jest.fn().mockResolvedValue(new Map()),
      boundDefinitionIdOfDestination: jest.fn().mockResolvedValue(null),
    };
    resolver = new DataDestinationCredentialsResolver(
      bindings as unknown as DestinationCredentialBindingService
    );
  });

  function destination(overrides: Partial<DataDestination> = {}): DataDestination {
    return {
      id: 'destination-1',
      projectId: 'project-1',
      type: DataDestinationType.GOOGLE_SHEETS,
      credentialId: 'old-row',
      credential: {
        id: 'old-row',
        type: DestinationCredentialType.GOOGLE_SERVICE_ACCOUNT,
        credentials: { type: 'google-sheets-credentials', serviceAccountKey: { old: true } },
      },
      ...overrides,
    } as unknown as DataDestination;
  }

  function bound(overrides: Partial<ResolvedDestinationCredential> = {}) {
    const credential: ResolvedDestinationCredential = {
      credentialId: 'credential-1',
      title: 'Secret team key',
      definitionId: 'google-service-account',
      state: 'ready',
      secret: { value: serviceAccountKey() },
      publicMetadata: null,
      ...overrides,
    };
    bindings.resolveForDestination.mockResolvedValue(credential);
    return credential;
  }

  function googleAccount(overrides: Partial<ResolvedDestinationCredential> = {}) {
    return bound({
      definitionId: 'google-sheets-oauth',
      secret: {
        oauth: {
          provider: 'google',
          clientId: 'destination-client',
          tokens: { access_token: 'a', token_type: 'Bearer', scope: SHEETS_SCOPE },
        },
      },
      publicMetadata: {
        account: { email: 'ann@example.com', name: null, picture: null },
        scopes: [SHEETS_SCOPE],
      },
      ...overrides,
    });
  }

  describe('resolve', () => {
    it('returns the old row of an unbound Destination, as before', async () => {
      await expect(resolver.resolve(destination())).resolves.toEqual({
        type: 'google-sheets-credentials',
        serviceAccountKey: { old: true },
      });
      expect(bindings.markDestinationUsed).not.toHaveBeenCalled();
    });

    it('throws for an unbound Destination without an old row', async () => {
      await expect(resolver.resolve(destination({ credential: null }))).rejects.toThrow(
        'Destination credentials are not configured'
      );
    });

    it('gives a bound service account key in the Sheets shape and marks it used', async () => {
      const credential = bound();

      await expect(resolver.resolve(destination())).resolves.toMatchObject({
        type: 'google-sheets-credentials',
        serviceAccountKey: JSON.parse((credential.secret as { value: string }).value),
      });
      expect(bindings.markDestinationUsed).toHaveBeenCalledWith('destination-1', 'credential-1');
    });

    it('reads a bound key without recording a use when asked not to', async () => {
      bound();

      await expect(resolver.resolve(destination(), { markUsed: false })).resolves.toMatchObject({
        type: 'google-sheets-credentials',
      });
      expect(bindings.markDestinationUsed).not.toHaveBeenCalled();
    });

    it('gives a bound webhook in the Google Chat shape', async () => {
      bound({
        definitionId: 'google-chat-webhook',
        secret: { fields: { webhookUrl: WEBHOOK_URL } },
        publicMetadata: { fields: {} },
      });

      await expect(
        resolver.resolve(destination({ type: DataDestinationType.GOOGLE_CHAT }))
      ).resolves.toEqual({ type: 'google-chat-credentials', webhookUrl: WEBHOOK_URL });
    });

    it('never falls back to the old row once bound', async () => {
      bound({ state: 'disabled' });

      const error = await resolver.resolve(destination()).catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(DestinationCredentialUnavailableException);
      expect((error as Error).message).toBe(
        "This Destination's Credential is disabled. A Credential maintainer can enable it on the Credentials page."
      );
      expect((error as Error).message).not.toContain('Secret team key');
      expect(bindings.markDestinationUsed).not.toHaveBeenCalled();
    });

    it('drops the parse error of an unreadable stored key', async () => {
      bound({ secret: { value: '{"private_key": "abc' } });

      await expect(resolver.resolve(destination())).rejects.toThrow(
        new Error("The stored key of this Destination's Credential could not be read")
      );
    });

    it('gives the same fixed message, not a schema dump, for a key the Sheets schema refuses', async () => {
      bound({ secret: { value: JSON.stringify({ type: 'service_account', private_key: 'x' }) } });

      await expect(resolver.resolve(destination())).rejects.toThrow(
        new Error("The stored key of this Destination's Credential could not be read")
      );
      expect(bindings.markDestinationUsed).not.toHaveBeenCalled();
    });

    it('sends a bound Google account to resolveAuth', async () => {
      googleAccount();
      bindings.getGoogleOAuth2Client.mockResolvedValue({ client: {}, clientId: 'c' } as never);

      await expect(resolver.resolve(destination())).rejects.toThrow('resolveAuth');
    });
  });

  describe('resolveAuth', () => {
    it('hands an unbound Destination its old row in one lookup, null when it has none', async () => {
      await expect(resolver.resolveAuth(destination())).resolves.toEqual({
        kind: 'unbound',
        credentials: { type: 'google-sheets-credentials', serviceAccountKey: { old: true } },
      });
      await expect(resolver.resolveAuth(destination({ credential: null }))).resolves.toEqual({
        kind: 'unbound',
        credentials: null,
      });
      expect(bindings.resolveForDestination).toHaveBeenCalledTimes(2);
    });

    it('gives a bound service account its parsed key', async () => {
      const credential = bound();

      const auth = await resolver.resolveAuth(destination());

      expect(auth).toMatchObject({
        kind: 'service-account',
        credentials: {
          type: 'google-sheets-credentials',
          serviceAccountKey: JSON.parse((credential.secret as { value: string }).value),
        },
      });
      expect(bindings.resolveForDestination).toHaveBeenCalledTimes(1);
    });

    it('gives a bound webhook in the Google Chat shape', async () => {
      bound({
        definitionId: 'google-chat-webhook',
        secret: { fields: { webhookUrl: WEBHOOK_URL } },
        publicMetadata: { fields: {} },
      });

      await expect(
        resolver.resolveAuth(destination({ type: DataDestinationType.GOOGLE_CHAT }))
      ).resolves.toEqual({
        kind: 'webhook',
        credentials: { type: 'google-chat-credentials', webhookUrl: WEBHOOK_URL },
      });
    });

    it("returns a Google account's client and granted scopes and marks it used", async () => {
      googleAccount();
      const client = { credentials: {} };
      bindings.getGoogleOAuth2Client.mockResolvedValue({ client, clientId: 'c' } as never);

      await expect(resolver.resolveAuth(destination())).resolves.toEqual({
        kind: 'google-account',
        client,
        scopes: [SHEETS_SCOPE],
      });
      expect(bindings.resolveForDestination).toHaveBeenCalledTimes(1);
      expect(bindings.getGoogleOAuth2Client).toHaveBeenCalledWith('project-1', 'credential-1');
      expect(bindings.markDestinationUsed).toHaveBeenCalledWith('destination-1', 'credential-1');
    });

    it.each([
      [
        'not-configured',
        'Sheets Google account Credentials cannot be used because Google sign-in is not configured on this server.',
        false,
      ],
      [
        'reconnect-required',
        "This Destination's Credential lost Google authorization. A Credential maintainer can reconnect it on the Credentials page.",
        true,
      ],
      [
        'reauthorize-required',
        "This Destination's Credential lacks the Google permissions this Destination needs. A Credential maintainer can reconnect it on the Credentials page to grant them.",
        true,
      ],
    ] as const)('names the fix for a %s Credential', async (state, message, reauthRequired) => {
      googleAccount({ state });

      const error = await resolver.resolveAuth(destination()).catch((thrown: unknown) => thrown);

      expect(error).toEqual(new DestinationCredentialUnavailableException(message, reauthRequired));
      expect((error as DestinationCredentialUnavailableException).reauthRequired).toBe(
        reauthRequired
      );
      expect(bindings.getGoogleOAuth2Client).not.toHaveBeenCalled();
    });

    it('asks for a reconnect when Google refuses the refresh', async () => {
      googleAccount();
      bindings.getGoogleOAuth2Client.mockRejectedValue(
        new CredentialsExpiredException('credential-1', 'credential')
      );

      await expect(resolver.resolveAuth(destination())).rejects.toThrow(
        "This Destination's Credential lost Google authorization."
      );
    });
  });

  describe('boundDefinitionId', () => {
    it('reads the definition from the binding, never loading the secret', async () => {
      bindings.boundDefinitionIdOfDestination.mockResolvedValue('google-sheets-oauth');

      await expect(resolver.boundDefinitionId(destination())).resolves.toBe('google-sheets-oauth');
      expect(bindings.boundDefinitionIdOfDestination).toHaveBeenCalledWith(destination());
      expect(bindings.resolveForDestination).not.toHaveBeenCalled();
    });
  });

  describe('candidateCredentials', () => {
    it('gives a service account key in the Sheets shape without recording a use', () => {
      const credential = bound();

      expect(resolver.candidateCredentials(credential)).toMatchObject({
        type: 'google-sheets-credentials',
        serviceAccountKey: JSON.parse((credential.secret as { value: string }).value),
      });
      expect(bindings.markDestinationUsed).not.toHaveBeenCalled();
    });

    it('has no key for a Google account', () => {
      expect(resolver.candidateCredentials(googleAccount())).toBeNull();
    });

    it.each(['reconnect-required', 'reauthorize-required', 'not-configured'] as const)(
      'has no key for a Google account in the %s state, and does not refuse it',
      state => {
        expect(resolver.candidateCredentials({ ...googleAccount(), state })).toBeNull();
      }
    );

    it.each(['reconnect-required', 'reauthorize-required', 'not-configured'] as const)(
      'still refuses a key Credential in the %s state',
      state => {
        expect(() => resolver.candidateCredentials(bound({ state }))).toThrow(
          DestinationCredentialUnavailableException
        );
      }
    );

    it('refuses a disabled Credential as a bound one would', () => {
      expect(() => resolver.candidateCredentials(bound({ state: 'disabled' }))).toThrow(
        DestinationCredentialUnavailableException
      );
    });
  });

  describe('summarize', () => {
    const row = (type: DestinationCredentialType, identity: object | null = null) =>
      ({
        credential: {
          type,
          identity,
          credentials: {
            type: 'google-sheets-credentials',
            serviceAccountKey: {
              type: 'service_account',
              project_id: 'acme',
              client_email: 'old-key@acme.iam.gserviceaccount.com',
              client_id: '42',
              private_key: 'never',
            },
          },
        },
      }) as Partial<DataDestination>;

    it('adds pending for unbound Destinations still on an old Sheets or webhook row', async () => {
      const restricted = { access: 'restricted', state: 'disabled' } as const;
      bindings.summarizeForDestinations.mockResolvedValue(new Map([['bound', restricted]]));
      bindings.publicOfDestinations.mockResolvedValue(
        new Map([
          [
            'bound',
            {
              definitionId: 'google-service-account',
              publicMetadata: {
                clientEmail: 'docs@acme.iam.gserviceaccount.com',
                projectId: 'acme',
                privateKeyId: 'key-1',
              },
            },
          ],
        ])
      );
      const destinations = [
        {
          id: 'bound',
          type: DataDestinationType.GOOGLE_SHEETS,
          ...row(DestinationCredentialType.GOOGLE_OAUTH),
        },
        {
          id: 'key',
          type: DataDestinationType.GOOGLE_SHEETS,
          ...row(DestinationCredentialType.GOOGLE_SERVICE_ACCOUNT, {
            clientEmail: 'old-key@acme.iam.gserviceaccount.com',
          }),
        },
        {
          id: 'account',
          type: DataDestinationType.GOOGLE_SHEETS,
          ...row(DestinationCredentialType.GOOGLE_OAUTH, {
            email: 'ann@example.com',
            name: 'Ann',
          }),
        },
        {
          id: 'no-identity',
          type: DataDestinationType.GOOGLE_SHEETS,
          ...row(DestinationCredentialType.GOOGLE_SERVICE_ACCOUNT),
        },
        {
          id: 'webhook',
          type: DataDestinationType.GOOGLE_CHAT,
          ...row(DestinationCredentialType.GOOGLE_CHAT_WEBHOOK),
        },
        {
          id: 'chat-email',
          type: DataDestinationType.GOOGLE_CHAT,
          ...row(DestinationCredentialType.EMAIL),
        },
        {
          id: 'looker',
          type: DataDestinationType.LOOKER_STUDIO,
          ...row(DestinationCredentialType.LOOKER_STUDIO),
        },
        { id: 'excel', type: DataDestinationType.EXCEL, credential: null },
      ] as unknown as DataDestination[];

      const summaries = await resolver.summarize('project-1', 'member-1', ['editor'], destinations);

      const pending = { access: 'pending', state: 'ready' } as const;
      const serviceAccount = (clientEmail: string, clientId?: string) => ({
        type: 'google-sheets-credentials',
        serviceAccountKey: {
          type: 'service_account',
          project_id: 'acme',
          client_email: clientEmail,
          ...(clientId && { client_id: clientId }),
        },
      });
      const account = {
        type: 'google-sheets-oauth-credentials',
        identity: { email: 'ann@example.com', name: 'Ann' },
      };
      expect(Object.fromEntries(summaries)).toEqual({
        bound: {
          ...restricted,
          identity: 'docs@acme.iam.gserviceaccount.com',
          definitionId: 'google-service-account',
          credentials: serviceAccount('docs@acme.iam.gserviceaccount.com'),
        },
        key: {
          ...pending,
          identity: 'old-key@acme.iam.gserviceaccount.com',
          definitionId: 'google-service-account',
          credentials: serviceAccount('old-key@acme.iam.gserviceaccount.com', '42'),
        },
        account: {
          ...pending,
          identity: 'ann@example.com',
          definitionId: 'google-sheets-oauth',
          credentials: { type: 'google-sheets-oauth-credentials', identity: account.identity },
        },
        'no-identity': {
          ...pending,
          identity: null,
          definitionId: 'google-service-account',
          credentials: serviceAccount('old-key@acme.iam.gserviceaccount.com', '42'),
        },
        webhook: { ...pending, credentials: { type: 'google-chat-credentials', configured: true } },
      });
      expect(summaries.get('webhook')).not.toHaveProperty('identity');
      expect(summaries.get('webhook')).not.toHaveProperty('definitionId');
      expect(JSON.stringify([...summaries])).not.toContain('never');
      expect(bindings.publicOfDestinations).toHaveBeenCalledWith('project-1', ['bound']);
      expect(bindings.summarizeForDestinations).toHaveBeenCalledWith({
        projectId: 'project-1',
        userId: 'member-1',
        roles: ['editor'],
        destinations: destinations.map(({ id, type }) => ({ id, type })),
      });
      expect(bindings.findBoundDestinationIds).toHaveBeenCalledWith('project-1', [
        'key',
        'account',
        'no-identity',
        'webhook',
      ]);
    });

    it('gives a Destination whose bound Credential is gone no summary, never its old row', async () => {
      bindings.findBoundDestinationIds.mockResolvedValue(new Set(['gone']));
      const destinations = [
        {
          id: 'gone',
          type: DataDestinationType.GOOGLE_SHEETS,
          ...row(DestinationCredentialType.GOOGLE_SERVICE_ACCOUNT),
        },
      ] as unknown as DataDestination[];

      const summaries = await resolver.summarize('project-1', 'member-1', ['editor'], destinations);

      expect(summaries.has('gone')).toBe(false);
      expect(bindings.findBoundDestinationIds).toHaveBeenCalledWith('project-1', ['gone']);
    });

    it('gives a restricted Chat Destination no identity and no provider', async () => {
      const restricted = { access: 'restricted', state: 'ready' } as const;
      bindings.summarizeForDestinations.mockResolvedValue(new Map([['chat', restricted]]));
      const destinations = [
        { id: 'chat', type: DataDestinationType.GOOGLE_CHAT, credential: null },
      ] as unknown as DataDestination[];

      const summaries = await resolver.summarize('project-1', 'member-1', ['editor'], destinations);

      expect(summaries.get('chat')).toEqual(restricted);
      expect(summaries.get('chat')).not.toHaveProperty('identity');
      expect(summaries.get('chat')).not.toHaveProperty('definitionId');
    });

    it("returns a bound service account's client_id when its Credential knows it, as before", async () => {
      const visible = { access: 'visible', state: 'ready' } as const;
      bindings.summarizeForDestinations.mockResolvedValue(
        new Map([
          ['known', visible],
          ['older', visible],
        ])
      );
      const metadata = {
        clientEmail: 'docs@acme.iam.gserviceaccount.com',
        projectId: 'acme',
        privateKeyId: 'key-1',
      };
      bindings.publicOfDestinations.mockResolvedValue(
        new Map([
          [
            'known',
            {
              definitionId: 'google-service-account',
              publicMetadata: { ...metadata, clientId: '42' },
            },
          ],
          ['older', { definitionId: 'google-service-account', publicMetadata: metadata }],
        ])
      );
      const destinations = ['known', 'older'].map(id => ({
        id,
        type: DataDestinationType.GOOGLE_SHEETS,
        credential: null,
      })) as unknown as DataDestination[];

      const summaries = await resolver.summarize('project-1', 'member-1', ['editor'], destinations);

      const key = {
        type: 'service_account',
        project_id: 'acme',
        client_email: 'docs@acme.iam.gserviceaccount.com',
      };
      expect(summaries.get('known')?.credentials).toEqual({
        type: 'google-sheets-credentials',
        serviceAccountKey: { ...key, client_id: '42' },
      });
      expect(summaries.get('older')?.credentials).toEqual({
        type: 'google-sheets-credentials',
        serviceAccountKey: key,
      });
    });

    it('hands a visible Credential its public credentials and a Google account its identity', async () => {
      const visible = {
        access: 'visible',
        id: 'credential-1',
        title: 'Ann',
        definitionId: 'google-sheets-oauth',
        providerName: 'Sheets Google account',
        identity: 'ann@example.com',
        state: 'ready',
      } as const;
      bindings.summarizeForDestinations.mockResolvedValue(new Map([['sheets', visible]]));
      bindings.publicOfDestinations.mockResolvedValue(
        new Map([
          [
            'sheets',
            {
              definitionId: 'google-sheets-oauth',
              publicMetadata: {
                account: { email: 'ann@example.com', name: 'Ann', picture: null },
                scopes: [],
              },
            },
          ],
        ])
      );
      const destinations = [
        { id: 'sheets', type: DataDestinationType.GOOGLE_SHEETS, credential: null },
      ] as unknown as DataDestination[];

      const summaries = await resolver.summarize('project-1', 'member-1', ['editor'], destinations);

      expect(summaries.get('sheets')).toEqual({
        ...visible,
        credentials: {
          type: 'google-sheets-oauth-credentials',
          identity: { email: 'ann@example.com', name: 'Ann' },
        },
      });
    });
  });
});
