import type { AuthorizationContext } from '../../idp';
import { AccessValidationException } from '../../common/exceptions/access-validation.exception';
import { serviceAccountKey } from '../../../test/fixtures/google-service-account-key';
import { Action, EntityType } from '../services/access-decision';
import { CredentialDestinationConsumersService } from './credential-destination-consumers.service';
import { DataDestinationType } from './enums/data-destination-type.enum';
import { GoogleSheetsApiAdapter } from './google-sheets/adapters/google-sheets-api.adapter';

const context = {
  projectId: 'project-1',
  userId: 'member-1',
  roles: ['editor'],
} as AuthorizationContext;

const WEBHOOK_URL = 'https://chat.googleapis.com/v1/spaces/B/messages?key=k&token=t';
const sales = { id: 'destination-sales', type: DataDestinationType.GOOGLE_CHAT, title: 'Sales' };
const ops = { id: 'destination-ops', type: DataDestinationType.GOOGLE_CHAT, title: 'Ops' };

const webhook = (webhookUrl: string) => ({
  definitionId: 'google-chat-webhook',
  secret: { fields: { webhookUrl } },
  publicMetadata: { fields: {} },
});

const destinationBinding = (consumerId: string) => ({ consumerType: 'destination', consumerId });

const currentWebhook = webhook(WEBHOOK_URL);
const serviceAccount = (key: string) => ({
  definitionId: 'google-service-account',
  secret: { value: key },
  publicMetadata: null,
});

function setup(visible: readonly string[] = [sales.id, ops.id]) {
  const destinations = { find: jest.fn().mockResolvedValue([sales, ops]) };
  const access = {
    canAccessMany: jest.fn(
      async (_user: string, _roles: string[], _type: EntityType, ids: readonly string[]) =>
        new Map(ids.map(id => [id, visible.includes(id)]))
    ),
  };
  const consumerTitles = { register: jest.fn() };
  const service = new CredentialDestinationConsumersService(
    destinations as never,
    access as never,
    consumerTitles as never
  );
  return { service, destinations, access, consumerTitles };
}

describe('CredentialDestinationConsumersService.verifyCandidate', () => {
  afterEach(() => jest.restoreAllMocks());

  it('counts no Destination for a replaced webhook URL: its check is format-only', async () => {
    const state = setup();

    await expect(
      state.service.verifyCandidate(
        context,
        [
          destinationBinding(sales.id),
          { consumerType: 'storage', consumerId: 'storage-1' },
          destinationBinding(ops.id),
        ],
        webhook(WEBHOOK_URL),
        currentWebhook
      )
    ).resolves.toBe(0);
    expect(state.destinations.find).toHaveBeenCalledWith(
      expect.objectContaining({ loadEagerRelations: false })
    );
  });

  it('refuses a URL that is not a Google Chat webhook without echoing it', async () => {
    const state = setup();
    const url = 'https://example.com/hook?token=secret-token';

    const error = await state.service
      .verifyCandidate(context, [destinationBinding(sales.id)], webhook(url), currentWebhook)
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(AccessValidationException);
    expect((error as Error).message).toBe(
      'The new values do not work for Destination "Sales": Enter a Google Chat incoming webhook URL.'
    );
    expect((error as Error).message).not.toContain('secret-token');
  });

  it('checks a replaced service account key once for Google Sheets', async () => {
    const state = setup();
    const key = serviceAccountKey();
    const validate = jest
      .spyOn(GoogleSheetsApiAdapter, 'validateCredentials')
      .mockResolvedValue(true);

    await expect(
      state.service.verifyCandidate(
        context,
        [destinationBinding(sales.id), destinationBinding(ops.id)],
        serviceAccount(key),
        serviceAccount(serviceAccountKey())
      )
    ).resolves.toBe(2);
    expect(validate).toHaveBeenCalledTimes(1);
    expect(validate).toHaveBeenCalledWith({
      type: 'google-sheets-credentials',
      serviceAccountKey: JSON.parse(key),
    });
  });

  it('refuses a service account key Google Sheets does not accept while it accepts the current one', async () => {
    const state = setup([ops.id]);
    const candidate = serviceAccountKey({ private_key_id: 'key-2' });
    jest
      .spyOn(GoogleSheetsApiAdapter, 'validateCredentials')
      .mockImplementation(async credentials =>
        Promise.resolve(credentials.serviceAccountKey?.private_key_id !== 'key-2')
      );

    await expect(
      state.service.verifyCandidate(
        context,
        [destinationBinding(sales.id), destinationBinding(ops.id)],
        serviceAccount(candidate),
        serviceAccount(serviceAccountKey())
      )
    ).rejects.toThrow(
      new AccessValidationException(
        'The new values do not work for Destination "Ops": Google Sheets did not accept the key.'
      )
    );
  });

  it('names no Destination the member cannot see', async () => {
    const state = setup([]);

    await expect(
      state.service.verifyCandidate(
        context,
        [destinationBinding(sales.id)],
        webhook('https://example.com/hook'),
        currentWebhook
      )
    ).rejects.toThrow(
      'The new values do not work for a Destination that uses this Credential: Enter a Google Chat incoming webhook URL.'
    );
  });

  it('saves unchecked when Google Sheets refuses the current key too: it was not reached', async () => {
    const state = setup();
    const validate = jest
      .spyOn(GoogleSheetsApiAdapter, 'validateCredentials')
      .mockResolvedValue(false);

    await expect(
      state.service.verifyCandidate(
        context,
        [destinationBinding(sales.id)],
        serviceAccount(serviceAccountKey({ private_key_id: 'key-2' })),
        serviceAccount(serviceAccountKey())
      )
    ).resolves.toBe(0);
    expect(validate).toHaveBeenCalledTimes(2);
  });

  it('checks nothing without Destination consumers', async () => {
    const state = setup();

    await expect(
      state.service.verifyCandidate(
        context,
        [{ consumerType: 'storage', consumerId: 'storage-1' }],
        webhook('not a url'),
        currentWebhook
      )
    ).resolves.toBe(0);
    expect(state.destinations.find).not.toHaveBeenCalled();
  });
});

describe('CredentialDestinationConsumersService.visibleTitles', () => {
  it('serves the titles of the Destinations the member can see to the Credentials page', async () => {
    const state = setup([ops.id]);
    state.service.onModuleInit();
    const [[consumerType, lookup]] = state.consumerTitles.register.mock.calls;

    expect(consumerType).toBe('destination');
    await expect(lookup(context, [sales.id, ops.id])).resolves.toEqual(new Map([[ops.id, 'Ops']]));
    expect(state.access.canAccessMany).toHaveBeenCalledWith(
      'member-1',
      ['editor'],
      EntityType.DESTINATION,
      [sales.id, ops.id],
      Action.SEE,
      'project-1'
    );
  });

  it('makes no query without Destination consumers', async () => {
    const state = setup();

    await expect(state.service.visibleTitles(context, [])).resolves.toEqual(new Map());
    expect(state.destinations.find).not.toHaveBeenCalled();
  });
});
