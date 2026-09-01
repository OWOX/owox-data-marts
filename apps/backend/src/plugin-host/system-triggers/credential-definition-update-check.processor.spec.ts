import { CredentialDefinitionUpdateCheckProcessor } from './credential-definition-update-check.processor';

describe('CredentialDefinitionUpdateCheckProcessor', () => {
  it('checks due definitions and moves every outcome to the next daily slot', async () => {
    const registry = {
      listDue: jest.fn().mockResolvedValue([
        { id: 'definition-1', repoOwner: 'acme', repoName: 'one' },
        { id: 'definition-2', repoOwner: 'acme', repoName: 'two' },
      ]),
      reschedule: jest.fn().mockResolvedValue(undefined),
    };
    const sync = {
      syncLocator: jest
        .fn()
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('GitHub unavailable')),
    };
    const processor = new CredentialDefinitionUpdateCheckProcessor(
      registry as never,
      sync as never
    );

    await expect(processor.process({} as never)).resolves.toBeUndefined();

    expect(sync.syncLocator).toHaveBeenNthCalledWith(1, '@acme/one');
    expect(sync.syncLocator).toHaveBeenNthCalledWith(2, '@acme/two');
    expect(registry.reschedule.mock.calls.map(call => call[0])).toEqual([
      'definition-1',
      'definition-2',
    ]);
  });
});
