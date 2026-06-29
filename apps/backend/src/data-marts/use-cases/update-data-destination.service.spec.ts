jest.mock('typeorm-transactional', () => ({
  Transactional: () => () => undefined,
}));

// Mock the MarkdownParserService module to avoid ESM-only package loading issues
// (rehype-sanitize, rehype-stringify, remark-github-blockquote-alert etc. are ESM-only).
// This is a pre-existing environment limitation — the test uses direct constructor injection
// so the mock is never actually called.
jest.mock('../../common/markdown/markdown-parser.service', () => ({
  MarkdownParser: jest.fn(),
  COLOR_THEME: {},
  GITHUB_MARKDOWN_CSS: '',
}));

jest.mock('../services/user-projections-fetcher.service', () => ({
  UserProjectionsFetcherService: jest.fn(),
}));

jest.mock('../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

import { NotFoundException } from '@nestjs/common';
import { UpdateDataDestinationCommand } from '../dto/domain/update-data-destination.command';
import { UpdateDataDestinationService } from './update-data-destination.service';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { DestinationCredentialType } from '../enums/destination-credential-type.enum';
import { CopyCredentialService } from '../services/copy-credential.service';

describe('UpdateDataDestinationService - credential copy (sourceDestinationId)', () => {
  const projectId = 'proj-1';
  const targetId = 'dest-target';
  const sourceId = 'dest-source';

  type DestinationConfigOverride = { folderId?: string | null; folderUrl?: string | null } | null;

  const makeCommand = (
    overrides: {
      id?: string;
      credentials?: Record<string, string>;
      credentialId?: string | null;
      sourceDestinationId?: string;
      config?: DestinationConfigOverride;
    } = {}
  ): UpdateDataDestinationCommand => {
    return new UpdateDataDestinationCommand(
      overrides.id ?? targetId,
      projectId,
      'Target Destination',
      overrides.credentials as never,
      overrides.credentialId,
      overrides.sourceDestinationId,
      undefined, // ownerIds
      undefined, // userId
      undefined, // roles
      undefined, // availableForUse
      undefined, // availableForMaintenance
      undefined, // contextIds
      overrides.config
    );
  };

  const makeTargetDestination = (
    overrides: {
      credentialId?: string | null;
      type?: DataDestinationType;
      credential?: object | null;
      config?: DestinationConfigOverride;
    } = {}
  ) => ({
    id: targetId,
    type: overrides.type ?? DataDestinationType.GOOGLE_SHEETS,
    projectId,
    credentialId: 'credentialId' in overrides ? overrides.credentialId : null,
    credential: 'credential' in overrides ? overrides.credential : null,
    config: 'config' in overrides ? overrides.config : null,
    title: 'Target Destination',
    createdById: null,
    ownerIds: [],
  });

  interface FakeCred {
    id: string;
    type: DestinationCredentialType;
    credentials: Record<string, string>;
    identity: Record<string, string> | null;
    expiresAt: Date | null;
  }

  const defaultCred: FakeCred = {
    id: 'cred-source',
    type: DestinationCredentialType.GOOGLE_SERVICE_ACCOUNT,
    credentials: { private_key: 'secret', client_email: 'sa@project.iam.gserviceaccount.com' },
    identity: { clientEmail: 'sa@project.iam.gserviceaccount.com' },
    expiresAt: null,
  };

  const makeSourceDestination = (
    overrides: {
      credentialId?: string | null;
      type?: DataDestinationType;
      credential?: FakeCred | null;
    } = {}
  ) => ({
    id: sourceId,
    type: overrides.type ?? DataDestinationType.GOOGLE_SHEETS,
    projectId,
    credentialId: 'credentialId' in overrides ? overrides.credentialId : 'cred-source',
    credential: 'credential' in overrides ? overrides.credential : defaultCred,
  });

  const createService = () => {
    const dataDestinationRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };
    const dataDestinationService = {
      getByIdAndProjectId: jest.fn(),
    };
    const dataDestinationMapper = {
      toDomainDto: jest.fn().mockReturnValue({ id: targetId }),
    };
    const credentialsValidator = {
      checkCredentials: jest.fn().mockResolvedValue(undefined),
    };
    const credentialsProcessor = {
      processCredentials: jest.fn().mockResolvedValue({}),
    };
    const availableDestinationTypesService = {
      verifyIsAllowed: jest.fn().mockReturnValue(undefined),
    };
    const dataDestinationCredentialService = {
      create: jest.fn(),
      update: jest.fn(),
      getById: jest.fn(),
      softDelete: jest.fn(),
    };
    const googleOAuthClientService = {
      getDestinationOAuth2ClientByCredentialId: jest.fn(),
    };

    const copyCredentialService = new CopyCredentialService(
      {} as never,
      dataDestinationCredentialService as never
    );

    const userProjectionsFetcherService = {
      fetchCreatedByUser: jest.fn().mockResolvedValue(null),
      fetchUserProjectionsList: jest.fn().mockResolvedValue({
        getByUserId: jest.fn().mockReturnValue(null),
      }),
    };

    const destinationOwnerRepository = {
      delete: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue([]),
    };

    const idpProjectionsFacade = {
      getProjectMembers: jest.fn().mockResolvedValue([]),
    };

    const accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(true),
    };

    const contextAccessService = {
      updateDestinationContexts: jest.fn().mockResolvedValue(undefined),
    };

    const folderValidator = { validateConfiguredFolder: jest.fn().mockResolvedValue(undefined) };

    const service = new UpdateDataDestinationService(
      dataDestinationRepository as never,
      dataDestinationService as never,
      dataDestinationMapper as never,
      credentialsValidator as never,
      credentialsProcessor as never,
      availableDestinationTypesService as never,
      dataDestinationCredentialService as never,
      googleOAuthClientService as never,
      copyCredentialService,
      userProjectionsFetcherService as never,
      idpProjectionsFacade as never,
      destinationOwnerRepository as never,
      accessDecisionService as never,
      contextAccessService as never,
      folderValidator as never
    );

    return {
      service,
      dataDestinationRepository,
      dataDestinationService,
      dataDestinationMapper,
      credentialsValidator,
      credentialsProcessor,
      availableDestinationTypesService,
      dataDestinationCredentialService,
      googleOAuthClientService,
      folderValidator,
    };
  };

  it('copies credential to target that has no existing credential (create called, credentialId assigned)', async () => {
    const {
      service,
      dataDestinationRepository,
      dataDestinationService,
      dataDestinationCredentialService,
    } = createService();

    const targetDestination = makeTargetDestination({ credentialId: null, credential: null });
    const sourceDestination = makeSourceDestination();
    const newCred = { id: 'cred-new' };

    dataDestinationService.getByIdAndProjectId
      .mockResolvedValueOnce(targetDestination)
      .mockResolvedValueOnce(sourceDestination)
      .mockResolvedValueOnce(targetDestination); // reload in buildResponse
    dataDestinationCredentialService.create.mockResolvedValue(newCred);
    dataDestinationRepository.save.mockResolvedValue({
      ...targetDestination,
      credentialId: 'cred-new',
    });

    const command = makeCommand({ sourceDestinationId: sourceId });
    await service.run(command);

    expect(dataDestinationCredentialService.create).toHaveBeenCalledWith({
      projectId,
      type: defaultCred.type,
      credentials: defaultCred.credentials,
      identity: defaultCred.identity,
      expiresAt: defaultCred.expiresAt,
    });
    expect(targetDestination.credentialId).toBe('cred-new');
    expect(dataDestinationRepository.save).toHaveBeenCalled();
  });

  it('copies credential to target that already has credential (update called)', async () => {
    const {
      service,
      dataDestinationRepository,
      dataDestinationService,
      dataDestinationCredentialService,
    } = createService();

    const targetDestination = makeTargetDestination({ credentialId: 'cred-existing' });
    const sourceDestination = makeSourceDestination();

    dataDestinationService.getByIdAndProjectId
      .mockResolvedValueOnce(targetDestination)
      .mockResolvedValueOnce(sourceDestination)
      .mockResolvedValueOnce(targetDestination); // reload in buildResponse
    dataDestinationCredentialService.update.mockResolvedValue(undefined);
    dataDestinationRepository.save.mockResolvedValue(targetDestination);

    const command = makeCommand({ sourceDestinationId: sourceId });
    await service.run(command);

    expect(dataDestinationCredentialService.update).toHaveBeenCalledWith('cred-existing', {
      type: defaultCred.type,
      credentials: defaultCred.credentials,
      identity: defaultCred.identity,
      expiresAt: defaultCred.expiresAt,
    });
    expect(dataDestinationCredentialService.create).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when source type differs from target type', async () => {
    const { service, dataDestinationService } = createService();

    const targetDestination = makeTargetDestination({ type: DataDestinationType.GOOGLE_SHEETS });
    const sourceDestination = makeSourceDestination({ type: DataDestinationType.LOOKER_STUDIO });

    dataDestinationService.getByIdAndProjectId.mockImplementation((id: string) => {
      if (id === targetId) return Promise.resolve(targetDestination);
      if (id === sourceId) return Promise.resolve(sourceDestination);
      return Promise.reject(new NotFoundException('Not found'));
    });

    const command = makeCommand({ sourceDestinationId: sourceId });

    await expect(service.run(command)).rejects.toThrow(/Cannot copy credentials/);
  });

  it('throws NotFoundException when source destination not found', async () => {
    const { service, dataDestinationService } = createService();

    const targetDestination = makeTargetDestination();
    dataDestinationService.getByIdAndProjectId.mockImplementation((id: string) => {
      if (id === targetId) return Promise.resolve(targetDestination);
      return Promise.reject(new NotFoundException('DataDestination not found'));
    });

    const command = makeCommand({ sourceDestinationId: sourceId });

    await expect(service.run(command)).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when source destination has no credential', async () => {
    const { service, dataDestinationService } = createService();

    const targetDestination = makeTargetDestination();
    const sourceDestination = makeSourceDestination({ credentialId: null, credential: null });

    dataDestinationService.getByIdAndProjectId.mockImplementation((id: string) => {
      if (id === targetId) return Promise.resolve(targetDestination);
      if (id === sourceId) return Promise.resolve(sourceDestination);
      return Promise.reject(new NotFoundException('Not found'));
    });

    const command = makeCommand({ sourceDestinationId: sourceId });

    await expect(service.run(command)).rejects.toThrow(
      /Source destination has no credentials to copy/
    );
  });

  it('throws BadRequestException when both sourceDestinationId and credentials are provided', async () => {
    const { service, dataDestinationService } = createService();

    dataDestinationService.getByIdAndProjectId.mockResolvedValue(makeTargetDestination());

    const command = makeCommand({
      sourceDestinationId: sourceId,
      credentials: { private_key: 'val' },
    });

    await expect(service.run(command)).rejects.toThrow(
      /Cannot provide both sourceDestinationId and credentials/
    );
  });

  it('does NOT call credentialsValidator.checkCredentials when sourceDestinationId is provided', async () => {
    const {
      service,
      dataDestinationRepository,
      dataDestinationService,
      credentialsValidator,
      dataDestinationCredentialService,
    } = createService();

    const targetDestination = makeTargetDestination({ credentialId: 'cred-existing' });
    const sourceDestination = makeSourceDestination();

    dataDestinationService.getByIdAndProjectId
      .mockResolvedValueOnce(targetDestination)
      .mockResolvedValueOnce(sourceDestination)
      .mockResolvedValueOnce(targetDestination); // reload in buildResponse
    dataDestinationCredentialService.update.mockResolvedValue(undefined);
    dataDestinationRepository.save.mockResolvedValue(targetDestination);

    const command = makeCommand({ sourceDestinationId: sourceId });
    await service.run(command);

    expect(credentialsValidator.checkCredentials).not.toHaveBeenCalled();
  });

  it('copies OAuth credential including expiresAt field', async () => {
    const {
      service,
      dataDestinationRepository,
      dataDestinationService,
      dataDestinationCredentialService,
    } = createService();

    const expiresAt = new Date('2026-01-01T00:00:00Z');
    const oauthCred: FakeCred = {
      id: 'cred-oauth',
      type: DestinationCredentialType.GOOGLE_OAUTH,
      credentials: { access_token: 'tok', refresh_token: 'ref' },
      identity: { email: 'user@example.com', name: 'Test User' },
      expiresAt,
    };
    const targetDestination = makeTargetDestination({ credentialId: null, credential: null });
    const sourceDestination = makeSourceDestination({
      credential: oauthCred,
      credentialId: 'cred-oauth',
    });

    dataDestinationService.getByIdAndProjectId
      .mockResolvedValueOnce(targetDestination)
      .mockResolvedValueOnce(sourceDestination)
      .mockResolvedValueOnce(targetDestination); // reload in buildResponse
    dataDestinationCredentialService.create.mockResolvedValue({ id: 'cred-new-oauth' });
    dataDestinationRepository.save.mockResolvedValue(targetDestination);

    const command = makeCommand({ sourceDestinationId: sourceId });
    await service.run(command);

    expect(dataDestinationCredentialService.create).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt })
    );
  });

  it('throws BadRequestException when both sourceDestinationId and credentialId are provided', async () => {
    const { service, dataDestinationService } = createService();

    dataDestinationService.getByIdAndProjectId.mockResolvedValue(makeTargetDestination());

    const command = makeCommand({
      sourceDestinationId: sourceId,
      credentialId: 'some-oauth-cred',
    });

    await expect(service.run(command)).rejects.toThrow(
      /Cannot provide both sourceDestinationId and credentialId/
    );
  });

  describe('Drive folder validation (only on folder change)', () => {
    it('skips folder validation when config is not provided (folder untouched)', async () => {
      const { service, dataDestinationRepository, dataDestinationService, folderValidator } =
        createService();

      const targetDestination = makeTargetDestination({ config: { folderId: 'folder-x' } });
      dataDestinationService.getByIdAndProjectId.mockResolvedValue(targetDestination);
      dataDestinationRepository.save.mockResolvedValue(targetDestination);

      // No config on the command => availability/rename-style update.
      await service.run(makeCommand());

      expect(folderValidator.validateConfiguredFolder).not.toHaveBeenCalled();
    });

    it('skips folder validation when the configured folderId is unchanged', async () => {
      const { service, dataDestinationRepository, dataDestinationService, folderValidator } =
        createService();

      const targetDestination = makeTargetDestination({
        config: { folderId: 'folder-x', folderUrl: 'https://drive/x' },
      });
      dataDestinationService.getByIdAndProjectId.mockResolvedValue(targetDestination);
      dataDestinationRepository.save.mockResolvedValue(targetDestination);

      // Same folderId, only the (derived) folderUrl differs — no Drive round-trip.
      await service.run(makeCommand({ config: { folderId: 'folder-x', folderUrl: 'https://x' } }));

      expect(folderValidator.validateConfiguredFolder).not.toHaveBeenCalled();
    });

    it('validates the folder when the configured folderId changes', async () => {
      const { service, dataDestinationRepository, dataDestinationService, folderValidator } =
        createService();

      const targetDestination = makeTargetDestination({ config: { folderId: 'folder-old' } });
      const savedEntity = { ...targetDestination, config: { folderId: 'folder-new' } };
      dataDestinationService.getByIdAndProjectId.mockResolvedValue(targetDestination);
      dataDestinationRepository.save.mockResolvedValue(savedEntity);

      await service.run(makeCommand({ config: { folderId: 'folder-new' } }));

      expect(folderValidator.validateConfiguredFolder).toHaveBeenCalledTimes(1);
      expect(folderValidator.validateConfiguredFolder).toHaveBeenCalledWith(savedEntity);
    });

    it('validates the folder when one is newly configured on a destination that had none', async () => {
      const { service, dataDestinationRepository, dataDestinationService, folderValidator } =
        createService();

      const targetDestination = makeTargetDestination({ config: null });
      const savedEntity = { ...targetDestination, config: { folderId: 'folder-new' } };
      dataDestinationService.getByIdAndProjectId.mockResolvedValue(targetDestination);
      dataDestinationRepository.save.mockResolvedValue(savedEntity);

      await service.run(makeCommand({ config: { folderId: 'folder-new' } }));

      expect(folderValidator.validateConfiguredFolder).toHaveBeenCalledTimes(1);
    });

    it('fails fast (rolls back) when the changed folder is not usable', async () => {
      const { service, dataDestinationRepository, dataDestinationService, folderValidator } =
        createService();

      const targetDestination = makeTargetDestination({ config: { folderId: 'folder-old' } });
      const savedEntity = { ...targetDestination, config: { folderId: 'folder-bad' } };
      dataDestinationService.getByIdAndProjectId.mockResolvedValue(targetDestination);
      dataDestinationRepository.save.mockResolvedValue(savedEntity);
      folderValidator.validateConfiguredFolder.mockRejectedValue(
        new Error('folder not accessible')
      );

      await expect(
        service.run(makeCommand({ config: { folderId: 'folder-bad' } }))
      ).rejects.toThrow('folder not accessible');
    });
  });
});
