import { ForbiddenException } from '@nestjs/common';
import type { AuthorizationContext } from '../../idp';
import { AddGithubCredentialDefinitionService } from './add-github-credential-definition.service';

const context = (roles: string[]): AuthorizationContext =>
  ({ projectId: 'project-1', userId: 'member-1', roles }) as AuthorizationContext;

describe('AddGithubCredentialDefinitionService', () => {
  it('refuses a deployment-wide definition registration from a non-admin member', async () => {
    const sync = { syncLocator: jest.fn() };
    const service = new AddGithubCredentialDefinitionService(sync as never);

    await expect(service.run(context(['editor']), '@acme/credentials')).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(sync.syncLocator).not.toHaveBeenCalled();
  });

  it('allows a Project Admin to register a definition', async () => {
    const definition = { definitionId: 'definition-1' };
    const sync = { syncLocator: jest.fn().mockResolvedValue(definition) };
    const service = new AddGithubCredentialDefinitionService(sync as never);

    await expect(service.run(context(['admin']), '@acme/credentials')).resolves.toBe(definition);
    expect(sync.syncLocator).toHaveBeenCalledWith('@acme/credentials');
  });
});
