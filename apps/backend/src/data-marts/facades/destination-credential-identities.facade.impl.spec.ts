import { DestinationCredentialIdentitiesFacadeImpl } from './destination-credential-identities.facade.impl';

describe('DestinationCredentialIdentitiesFacadeImpl', () => {
  it('names each bound Destination, null when its Credential names no one or was deleted', async () => {
    const ids = ['account', 'webhook', 'deleted', 'unbound'];
    // One read serves both: a binding whose Credential was deleted comes back null.
    const destinationCredentials = {
      identitiesForDestinations: jest.fn().mockResolvedValue(
        new Map([
          ['account', 'me@example.com'],
          ['webhook', null],
          ['deleted', null],
        ])
      ),
    };
    const facade = new DestinationCredentialIdentitiesFacadeImpl(destinationCredentials as never);

    await expect(facade.identitiesForDestinations('project-1', ids)).resolves.toEqual(
      new Map([
        ['account', 'me@example.com'],
        ['webhook', null],
        ['deleted', null],
      ])
    );
    expect(destinationCredentials.identitiesForDestinations).toHaveBeenCalledWith(
      'project-1',
      ids,
      true
    );
  });
});
