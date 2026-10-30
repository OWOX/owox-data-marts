import { ForbiddenException } from '@nestjs/common';
import { AuthorizationContext } from '../../../idp';
import { AccessDecisionService } from '../access-decision';
import { ConnectorCredentialInjectorService } from './connector-credential-injector.service';
import { SourceCredentialInjectorService } from './source-credential-injector.service';
import { ConnectorSourceCredentialsService } from './connector-source-credentials.service';
import { ConnectorCredentialBoundaryError } from '../../errors/connector-credential-boundary.error';
import { SourceCredentialBindingService } from '../../connector-types/source-credential-binding.service';
import { ConnectorPreviewCredentialsService } from './connector-preview-credentials.service';

describe('ConnectorPreviewCredentialsService', () => {
  const context: AuthorizationContext = {
    projectId: 'proj-1',
    userId: 'user-1',
    roles: ['editor'],
  };

  const createService = () => {
    const credentialInjector = {
      injectSecrets: jest.fn().mockImplementation(config => Promise.resolve(config)),
      injectOAuthCredentials: jest.fn().mockImplementation(config => Promise.resolve(config)),
    } as unknown as ConnectorCredentialInjectorService;
    const sourceCredentialInjector = {
      previewBoundConfig: jest.fn().mockReturnValue({ injected: true }),
    } as unknown as SourceCredentialInjectorService;
    const credentials = {
      getCredentialsById: jest.fn(),
    } as unknown as ConnectorSourceCredentialsService;
    const access = {
      canAccess: jest.fn().mockResolvedValue(true),
    } as unknown as AccessDecisionService;

    const sourceCredentials = {
      boundCredentialIds: jest.fn().mockResolvedValue(new Map()),
      assertCanUseCredential: jest.fn().mockResolvedValue(undefined),
      hasCredential: jest.fn().mockResolvedValue(true),
      resolveCredential: jest.fn().mockResolvedValue({ credentialId: 'cred-1' }),
      boundCredentialGone: jest
        .fn()
        .mockReturnValue(new Error("This Data Mart's Credential was deleted.")),
    } as unknown as jest.Mocked<SourceCredentialBindingService>;

    return {
      service: new ConnectorPreviewCredentialsService(
        credentialInjector,
        credentials,
        access,
        sourceCredentials,
        sourceCredentialInjector
      ),
      sourceCredentials,
      credentialInjector,
      sourceCredentialInjector,
      credentials,
      access,
    };
  };

  it('allows project-level Google Sheets OAuth credentials', async () => {
    const { service, credentials, credentialInjector } = createService();
    const config = { AuthType: { oauth2: { _source_credential_id: 'oauth-1' } } };
    (credentials.getCredentialsById as jest.Mock).mockResolvedValue({
      id: 'oauth-1',
      projectId: 'proj-1',
      connectorName: 'GoogleSheets',
    });

    await service.inject('GoogleSheets', config, context);

    expect(credentialInjector.injectOAuthCredentials).toHaveBeenCalledWith(
      config,
      'GoogleSheets',
      'proj-1'
    );
  });

  it('rejects Data-Mart-scoped records used as OAuth credentials', async () => {
    const { service, credentials } = createService();
    const config = { AuthType: { oauth2: { _source_credential_id: 'oauth-1' } } };
    (credentials.getCredentialsById as jest.Mock).mockResolvedValue({
      id: 'oauth-1',
      projectId: 'proj-1',
      connectorName: 'GoogleSheets',
      dataMartId: 'dm-1',
      configId: 'config-1',
    });

    await expect(service.inject('GoogleSheets', config, context)).rejects.toThrow(
      'The selected credentials cannot be used for this preview'
    );
  });

  it('refuses a foreign _secrets_id and ignores _copiedFrom even when the source Data Mart is editable', async () => {
    const { service, credentials, access } = createService();
    const config = {
      _id: 'config-1',
      _secrets_id: 'secret-1',
      _copiedFrom: { dataMartId: 'dm-1', configId: 'config-2' },
    };
    (credentials.getCredentialsById as jest.Mock).mockResolvedValue({
      id: 'secret-1',
      projectId: 'proj-1',
      connectorName: 'GoogleSheets',
      dataMartId: 'dm-1',
      configId: 'config-2',
    });

    await expect(service.inject('GoogleSheets', config, context)).rejects.toThrow(
      'The selected credentials cannot be used for this preview'
    );
    expect(access.canAccess).not.toHaveBeenCalled();
  });

  describe("a Data Mart's own service-account secrets", () => {
    const secretsRow = {
      id: 'secret-1',
      projectId: 'proj-1',
      connectorName: 'GoogleSheets',
      dataMartId: 'dm-1',
      configId: 'config-1',
    };
    const config = { _id: 'config-1', _secrets_id: 'secret-1' };
    const expectEditCheck = (access: AccessDecisionService) =>
      expect(access.canAccess).toHaveBeenCalledWith(
        'user-1',
        ['editor'],
        'DATA_MART',
        'dm-1',
        'EDIT',
        'proj-1'
      );

    it('are refused when the caller cannot edit the Data Mart', async () => {
      const { service, credentials, access, credentialInjector } = createService();
      (credentials.getCredentialsById as jest.Mock).mockResolvedValue(secretsRow);
      (access.canAccess as jest.Mock).mockResolvedValue(false);

      await expect(service.inject('GoogleSheets', config, context)).rejects.toThrow(
        'The selected credentials cannot be used for this preview'
      );
      expectEditCheck(access);
      expect(credentialInjector.injectSecrets).not.toHaveBeenCalled();
    });

    it('are injected when the caller can edit the Data Mart', async () => {
      const { service, credentials, access, credentialInjector } = createService();
      (credentials.getCredentialsById as jest.Mock).mockResolvedValue(secretsRow);

      await service.inject('GoogleSheets', config, context);

      expectEditCheck(access);
      expect(credentialInjector.injectSecrets).toHaveBeenCalled();
    });
  });

  it('rejects credentials from another connector', async () => {
    const { service, credentials } = createService();
    (credentials.getCredentialsById as jest.Mock).mockResolvedValue({
      id: 'oauth-1',
      projectId: 'proj-1',
      connectorName: 'GoogleAds',
    });

    await expect(
      service.inject(
        'GoogleSheets',
        { AuthType: { oauth2: { _source_credential_id: 'oauth-1' } } },
        context
      )
    ).rejects.toThrow('The selected credentials cannot be used for this preview');
  });

  it('previews a replacement inline key instead of the stored key', async () => {
    const { service, credentialInjector, credentials, access } = createService();
    const config = {
      _id: 'config-1',
      _secrets_id: 'secret-1',
      AuthType: { service_account: { ServiceAccountKey: '{"client_email":"new@test"}' } },
    };
    await service.inject('GoogleSheets', config, context);
    expect(credentialInjector.injectSecrets).toHaveBeenCalledWith(
      expect.not.objectContaining({ _secrets_id: expect.anything() }),
      'proj-1',
      'GoogleSheets'
    );
    expect(credentials.getCredentialsById).not.toHaveBeenCalled();
    expect(access.canAccess).not.toHaveBeenCalled();
  });

  describe('_credential_id', () => {
    const config = { _id: 'cfg-1', _credential_id: 'cred-1', AuthType: { oauth2: {} } };
    const stored = { _id: 'cfg-1', AuthType: { oauth2: {} } };

    it('injects a _credential_id the caller can USE', async () => {
      const { service, sourceCredentials, sourceCredentialInjector, credentials } = createService();

      await expect(service.inject('FacebookMarketing', config, context)).resolves.toEqual({
        injected: true,
      });

      expect(sourceCredentials.assertCanUseCredential).toHaveBeenCalledWith({
        projectId: 'proj-1',
        userId: 'user-1',
        roles: ['editor'],
        credentialId: 'cred-1',
      });
      expect(sourceCredentialInjector.previewBoundConfig).toHaveBeenCalledWith(
        stored,
        'FacebookMarketing',
        { credentialId: 'cred-1' }
      );
      expect(credentials.getCredentialsById).not.toHaveBeenCalled();
    });

    it('injects a _credential_id bound to that configuration of a Data Mart the caller can EDIT', async () => {
      const { service, sourceCredentials, access, sourceCredentialInjector } = createService();
      sourceCredentials.assertCanUseCredential.mockRejectedValue(new Error('no USE'));
      sourceCredentials.boundCredentialIds.mockResolvedValue(new Map([['cfg-1', 'cred-1']]));

      await service.inject('FacebookMarketing', config, context, 'dm-1');

      expect(sourceCredentials.boundCredentialIds).toHaveBeenCalledWith('proj-1', 'dm-1');
      expect(access.canAccess).toHaveBeenCalledWith(
        'user-1',
        ['editor'],
        'DATA_MART',
        'dm-1',
        'EDIT',
        'proj-1'
      );
      expect(sourceCredentialInjector.previewBoundConfig).toHaveBeenCalled();
    });

    it('refuses a _credential_id bound elsewhere when the caller cannot USE it', async () => {
      const { service, sourceCredentials, sourceCredentialInjector } = createService();
      sourceCredentials.assertCanUseCredential.mockRejectedValue(new ForbiddenException());
      sourceCredentials.boundCredentialIds.mockResolvedValue(new Map([['cfg-2', 'cred-1']]));

      await expect(service.inject('FacebookMarketing', config, context, 'dm-1')).rejects.toThrow(
        ForbiddenException
      );
      expect(sourceCredentialInjector.previewBoundConfig).not.toHaveBeenCalled();
    });

    it('refuses the bound Credential when the caller can neither USE it nor EDIT the Data Mart', async () => {
      const { service, sourceCredentials, access } = createService();
      sourceCredentials.assertCanUseCredential.mockRejectedValue(new ForbiddenException());
      sourceCredentials.boundCredentialIds.mockResolvedValue(new Map([['cfg-1', 'cred-1']]));
      (access.canAccess as jest.Mock).mockResolvedValue(false);

      await expect(service.inject('FacebookMarketing', config, context, 'dm-1')).rejects.toThrow(
        ForbiddenException
      );
    });

    it("a deleted bound Credential gives the run's deleted error to a member with EDIT", async () => {
      const { service, sourceCredentials } = createService();
      sourceCredentials.assertCanUseCredential.mockRejectedValue(new ForbiddenException());
      sourceCredentials.boundCredentialIds.mockResolvedValue(new Map([['cfg-1', null]]));

      await expect(service.inject('FacebookMarketing', config, context, 'dm-1')).rejects.toThrow(
        "This Data Mart's Credential was deleted."
      );
    });

    it('a member without EDIT gets the plain USE error for a configuration bound to a deleted Credential', async () => {
      const { service, sourceCredentials, access } = createService();
      const useError = new ForbiddenException('You cannot use this Credential.');
      sourceCredentials.assertCanUseCredential.mockRejectedValue(useError);
      sourceCredentials.boundCredentialIds.mockResolvedValue(new Map([['cfg-1', null]]));
      (access.canAccess as jest.Mock).mockResolvedValue(false);

      await expect(service.inject('FacebookMarketing', config, context, 'dm-1')).rejects.toBe(
        useError
      );
    });

    it('refuses an id that is no Credential of the project, though the caller may USE every Credential', async () => {
      const { service, sourceCredentials, sourceCredentialInjector } = createService();
      sourceCredentials.hasCredential.mockResolvedValue(false);

      await expect(service.inject('FacebookMarketing', config, context)).rejects.toThrow(
        'The selected credentials cannot be used for this preview'
      );
      expect(sourceCredentials.hasCredential).toHaveBeenCalledWith('proj-1', 'cred-1');
      expect(sourceCredentialInjector.previewBoundConfig).not.toHaveBeenCalled();
    });

    it("refuses a Credential of another connector's definition", async () => {
      const { service, sourceCredentialInjector } = createService();
      (sourceCredentialInjector.previewBoundConfig as jest.Mock).mockImplementation(() => {
        throw new ConnectorCredentialBoundaryError('Credential cred-1 does not belong');
      });

      await expect(service.inject('TikTokAds', config, context)).rejects.toThrow(
        'The selected credentials cannot be used for this preview'
      );
    });
  });
});
