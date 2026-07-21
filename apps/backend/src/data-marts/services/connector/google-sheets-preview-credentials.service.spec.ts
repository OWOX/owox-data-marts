import { AuthorizationContext } from '../../../idp';
import { AccessDecisionService } from '../access-decision';
import { ConnectorCredentialInjectorService } from './connector-credential-injector.service';
import { ConnectorSourceCredentialsService } from './connector-source-credentials.service';
import { GoogleSheetsPreviewCredentialsService } from './google-sheets-preview-credentials.service';

describe('GoogleSheetsPreviewCredentialsService', () => {
  const context: AuthorizationContext = {
    projectId: 'proj-1',
    userId: 'user-1',
    roles: ['editor'],
  };

  const createService = () => {
    const credentialInjector = {
      injectSecrets: jest.fn().mockImplementation(config => Promise.resolve(config)),
    } as unknown as ConnectorCredentialInjectorService;
    const credentials = {
      getCredentialsById: jest.fn(),
    } as unknown as ConnectorSourceCredentialsService;
    const access = {
      canAccess: jest.fn().mockResolvedValue(true),
    } as unknown as AccessDecisionService;

    return {
      service: new GoogleSheetsPreviewCredentialsService(credentialInjector, credentials, access),
      credentialInjector,
      credentials,
      access,
    };
  };

  it('allows copied service-account secrets only when the source Data Mart is editable', async () => {
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

    await expect(service.inject(config, context)).resolves.toBeDefined();
    expect(access.canAccess).toHaveBeenCalledWith(
      'user-1',
      ['editor'],
      'DATA_MART',
      'dm-1',
      'EDIT',
      'proj-1'
    );
  });

  it('rejects copied service-account secrets when the source Data Mart is not editable', async () => {
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
    (access.canAccess as jest.Mock).mockResolvedValue(false);

    await expect(service.inject(config, context)).rejects.toThrow(
      'The selected credentials cannot be used for this preview'
    );
  });

  it('rejects credentials from another connector', async () => {
    const { service, credentials } = createService();
    (credentials.getCredentialsById as jest.Mock).mockResolvedValue({
      id: 'secret-1',
      projectId: 'proj-1',
      connectorName: 'GoogleAds',
    });

    await expect(
      service.inject({ _id: 'config-1', _secrets_id: 'secret-1' }, context)
    ).rejects.toThrow('The selected credentials cannot be used for this preview');
  });
});
