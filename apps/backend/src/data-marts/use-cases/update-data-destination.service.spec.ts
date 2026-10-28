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

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UpdateDataDestinationCommand } from '../dto/domain/update-data-destination.command';
import { UpdateDataDestinationService } from './update-data-destination.service';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { DestinationCredentialType } from '../enums/destination-credential-type.enum';
import { DataDestinationCredentials } from '../data-destination-types/data-destination-credentials.type';
import { SearchableEntityType } from '../../common/search/search.facade';

const STALE = 'This page is out of date. Reload it.';

describe('UpdateDataDestinationService', () => {
  const projectId = 'proj-1';
  const targetId = 'dest-target';
  const webhookUrl = 'https://chat.googleapis.com/v1/spaces/space-1/messages?key=key-1&token=t-1';

  type DestinationConfigOverride = { folderId?: string | null; folderUrl?: string | null } | null;

  const makeCommand = (
    overrides: {
      title?: string;
      credentials?: DataDestinationCredentials | Record<string, unknown>;
      reusableCredentialId?: string | null;
      sentOldCredentialFields?: boolean;
      isPluginCall?: boolean;
      config?: DestinationConfigOverride;
      ownerIds?: string[];
      userId?: string;
      roles?: string[];
      availableForUse?: boolean;
      availableForMaintenance?: boolean;
    } = {}
  ): UpdateDataDestinationCommand =>
    new UpdateDataDestinationCommand(
      targetId,
      projectId,
      overrides.title ?? 'Target Destination',
      overrides.credentials as never,
      overrides.reusableCredentialId,
      overrides.sentOldCredentialFields,
      overrides.ownerIds,
      overrides.userId ?? 'user-1',
      overrides.roles ?? ['editor'],
      overrides.availableForUse,
      overrides.availableForMaintenance,
      undefined, // contextIds
      overrides.config,
      overrides.isPluginCall
    );

  const makeTarget = (
    overrides: {
      credentialId?: string | null;
      type?: DataDestinationType;
      credential?: object | null;
      config?: DestinationConfigOverride;
      title?: string;
    } = {}
  ) => ({
    id: targetId,
    type: overrides.type ?? DataDestinationType.GOOGLE_SHEETS,
    projectId,
    credentialId: 'credentialId' in overrides ? overrides.credentialId : null,
    credential: 'credential' in overrides ? overrides.credential : null,
    config: 'config' in overrides ? overrides.config : null,
    title: overrides.title ?? 'Target Destination',
    createdById: null,
    ownerIds: [],
  });

  const serviceAccountKey = {
    definitionId: 'google-service-account',
    publicMetadata: {
      clientEmail: 'writer@acme.iam.gserviceaccount.com',
      projectId: 'acme',
      privateKeyId: 'key-1',
    },
  };
  const googleAccount = (email: string) => ({
    definitionId: 'google-sheets-oauth',
    publicMetadata: { account: { email, name: null, picture: null }, scopes: [] },
  });
  const candidateOf = (credential: object, credentialId = 'credential-1') => ({
    credentialId,
    title: 'Chosen',
    state: 'ready',
    secret: {},
    ...credential,
  });

  const emailRow = {
    id: 'row-email',
    type: DestinationCredentialType.EMAIL,
    credentials: { type: 'email-credentials', to: ['space@example.com'] },
  };

  const createService = (target: ReturnType<typeof makeTarget> = makeTarget()) => {
    const dataDestinationRepository = {
      save: jest.fn().mockImplementation((entity: unknown) => Promise.resolve(entity)),
      findOne: jest.fn().mockResolvedValue({ id: targetId }),
      manager: { connection: { options: { type: 'better-sqlite3' } } },
    };
    const dataDestinationService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue(target),
    };
    const dataDestinationMapper = {
      toDomainDto: jest.fn().mockReturnValue({ id: targetId }),
    };
    const credentialsValidator = {
      checkCredentials: jest.fn().mockResolvedValue(undefined),
    };
    const credentialsProcessor = {
      processCredentials: jest
        .fn()
        .mockImplementation((_type: unknown, credentials: unknown) => Promise.resolve(credentials)),
    };
    const dataDestinationCredentialService = {
      create: jest.fn().mockResolvedValue({ id: 'row-new' }),
      update: jest.fn().mockResolvedValue(undefined),
      softDelete: jest.fn().mockResolvedValue(undefined),
    };
    const candidate = candidateOf(serviceAccountKey);
    const destinationCredentials = {
      checkDestinationBinding: jest.fn().mockResolvedValue(candidate),
      lockedPublicOfDestination: jest.fn().mockResolvedValue(undefined),
      boundCredentialIdOfDestination: jest.fn().mockResolvedValue(null),
      bindDestination: jest.fn().mockResolvedValue(undefined),
      deactivateDestination: jest.fn().mockResolvedValue(undefined),
      findBoundDestinationIds: jest.fn().mockResolvedValue(new Set<string>()),
    };
    const summaries = new Map([[targetId, { access: 'visible', id: 'credential-1' }]]);
    const credentialsResolver = { summarize: jest.fn().mockResolvedValue(summaries) };
    const userProjectionsFetcherService = {
      fetchUserProjectionsList: jest.fn().mockResolvedValue({
        getByUserId: jest.fn().mockReturnValue(null),
      }),
    };
    const destinationOwnerRepository = {
      delete: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue([]),
    };
    const idpProjectionsFacade = { getProjectMembers: jest.fn().mockResolvedValue([]) };
    const accessDecisionService = { canAccess: jest.fn().mockResolvedValue(true) };
    const contextAccessService = {
      updateDestinationContexts: jest.fn().mockResolvedValue(undefined),
    };
    const folderValidator = { validateConfiguredFolder: jest.fn().mockResolvedValue(undefined) };
    const advancedSearchIndexSync = {
      scheduleReindex: jest.fn().mockResolvedValue(undefined),
      scheduleTypeProjectSync: jest.fn().mockResolvedValue(undefined),
      scheduleReportsReindex: jest.fn().mockResolvedValue(undefined),
    };

    const service = new UpdateDataDestinationService(
      dataDestinationRepository as never,
      dataDestinationService as never,
      dataDestinationMapper as never,
      credentialsValidator as never,
      credentialsProcessor as never,
      dataDestinationCredentialService as never,
      destinationCredentials as never,
      credentialsResolver as never,
      userProjectionsFetcherService as never,
      idpProjectionsFacade as never,
      destinationOwnerRepository as never,
      accessDecisionService as never,
      contextAccessService as never,
      folderValidator as never,
      advancedSearchIndexSync as never
    );

    return {
      service,
      target,
      candidate,
      summaries,
      dataDestinationService,
      advancedSearchIndexSync,
      dataDestinationRepository,
      dataDestinationMapper,
      credentialsValidator,
      credentialsProcessor,
      dataDestinationCredentialService,
      destinationCredentials,
      credentialsResolver,
      folderValidator,
      accessDecisionService,
    };
  };

  describe('Credential', () => {
    it('checks the folder with the chosen Credential, then binds it last', async () => {
      const {
        service,
        target,
        candidate,
        destinationCredentials,
        folderValidator,
        advancedSearchIndexSync,
        dataDestinationRepository,
        dataDestinationCredentialService,
        credentialsResolver,
      } = createService(makeTarget({ config: { folderId: 'folder-x' } }));
      const member = {
        projectId,
        userId: 'user-1',
        roles: ['editor'],
        credentialId: 'credential-1',
        type: DataDestinationType.GOOGLE_SHEETS,
      };

      await service.run(makeCommand({ reusableCredentialId: 'credential-1' }));

      expect(destinationCredentials.checkDestinationBinding).toHaveBeenCalledWith(member);
      expect(folderValidator.validateConfiguredFolder).toHaveBeenCalledWith(target, candidate);
      expect(destinationCredentials.bindDestination).toHaveBeenCalledWith({
        ...member,
        destinationId: targetId,
      });
      const order = (mock: jest.Mock) => mock.mock.invocationCallOrder[0];
      const bindOrder = order(destinationCredentials.bindDestination);
      expect(order(destinationCredentials.checkDestinationBinding)).toBeLessThan(
        order(dataDestinationRepository.save)
      );
      expect(order(dataDestinationRepository.save)).toBeLessThan(bindOrder);
      expect(order(advancedSearchIndexSync.scheduleReindex)).toBeLessThan(bindOrder);
      expect(order(folderValidator.validateConfiguredFolder)).toBeLessThan(bindOrder);
      expect(bindOrder).toBeLessThan(order(credentialsResolver.summarize));
      expect(dataDestinationCredentialService.softDelete).not.toHaveBeenCalled();
    });

    it('binds nothing when the folder check fails', async () => {
      const { service, destinationCredentials, folderValidator } = createService(
        makeTarget({ config: { folderId: 'folder-x' } })
      );
      folderValidator.validateConfiguredFolder.mockRejectedValue(new Error('folder not usable'));

      await expect(
        service.run(makeCommand({ reusableCredentialId: 'credential-1' }))
      ).rejects.toThrow('folder not usable');
      expect(destinationCredentials.bindDestination).not.toHaveBeenCalled();
    });

    it('needs EDIT on the Destination before checking the Credential', async () => {
      const { service, accessDecisionService, destinationCredentials } = createService();
      accessDecisionService.canAccess.mockResolvedValue(false);

      await expect(
        service.run(makeCommand({ reusableCredentialId: 'credential-1' }))
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(destinationCredentials.checkDestinationBinding).not.toHaveBeenCalled();
      expect(destinationCredentials.bindDestination).not.toHaveBeenCalled();
    });

    it('saves nothing when the Credential check refuses', async () => {
      const { service, destinationCredentials, dataDestinationRepository } = createService();
      destinationCredentials.checkDestinationBinding.mockRejectedValue(
        new ForbiddenException('You cannot use this Credential.')
      );

      await expect(
        service.run(makeCommand({ reusableCredentialId: 'credential-1' }))
      ).rejects.toThrow('You cannot use this Credential.');
      expect(dataDestinationRepository.save).not.toHaveBeenCalled();
      expect(destinationCredentials.bindDestination).not.toHaveBeenCalled();
    });

    it('returns the Credential as the member sees it', async () => {
      const { service, target, credentialsResolver, dataDestinationMapper, summaries } =
        createService();

      await service.run(makeCommand());

      expect(credentialsResolver.summarize).toHaveBeenCalledWith(
        projectId,
        'user-1',
        ['editor'],
        [target]
      );
      expect(dataDestinationMapper.toDomainDto).toHaveBeenCalledWith(
        target,
        null,
        expect.any(Array),
        summaries
      );
    });

    it.each([
      ['credentialId or sourceDestinationId', { sentOldCredentialFields: true }],
      [
        'a service account key',
        { credentials: { type: 'google-sheets-credentials', serviceAccountKey: {} } },
      ],
    ])('tells an older page that sends %s to reload, saving nothing', async (_what, fields) => {
      const { service, dataDestinationRepository, destinationCredentials } = createService();

      await expect(service.run(makeCommand(fields))).rejects.toThrow(STALE);
      expect(dataDestinationRepository.save).not.toHaveBeenCalled();
      expect(destinationCredentials.bindDestination).not.toHaveBeenCalled();
    });

    it('saves a Google Sheets rename from an older page that sends keyless credentials', async () => {
      const { service, dataDestinationRepository, dataDestinationCredentialService } =
        createService();

      await service.run(
        makeCommand({ title: 'Renamed', credentials: { type: 'google-sheets-credentials' } })
      );

      expect(dataDestinationRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Renamed' })
      );
      expect(dataDestinationCredentialService.update).not.toHaveBeenCalled();
      expect(dataDestinationCredentialService.create).not.toHaveBeenCalled();
    });

    it('refuses a plugin that selects a Credential', async () => {
      const { service, destinationCredentials } = createService();

      await expect(
        service.run(makeCommand({ reusableCredentialId: 'credential-1', isPluginCall: true }))
      ).rejects.toThrow("Plugins cannot change a Destination's Credential.");
      expect(destinationCredentials.checkDestinationBinding).not.toHaveBeenCalled();
      expect(destinationCredentials.bindDestination).not.toHaveBeenCalled();
    });

    it('refuses a Credential on a Looker Studio Destination', async () => {
      const { service, destinationCredentials } = createService(
        makeTarget({ type: DataDestinationType.LOOKER_STUDIO })
      );

      await expect(
        service.run(makeCommand({ reusableCredentialId: 'credential-1' }))
      ).rejects.toThrow('Data Studio destinations do not use a Credential.');
      expect(destinationCredentials.bindDestination).not.toHaveBeenCalled();
    });
  });

  describe('Google Chat delivery method switching', () => {
    it('binds a webhook Credential and drops the email row', async () => {
      const {
        service,
        target,
        destinationCredentials,
        dataDestinationCredentialService,
        dataDestinationRepository,
      } = createService(
        makeTarget({
          type: DataDestinationType.GOOGLE_CHAT,
          credentialId: 'row-email',
          credential: emailRow,
        })
      );

      await service.run(makeCommand({ reusableCredentialId: 'credential-1' }));

      expect(destinationCredentials.bindDestination).toHaveBeenCalledWith(
        expect.objectContaining({ type: DataDestinationType.GOOGLE_CHAT, destinationId: targetId })
      );
      expect(dataDestinationCredentialService.softDelete).toHaveBeenCalledWith('row-email');
      expect(dataDestinationRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ credentialId: null, credential: null })
      );
      expect(target.credentialId).toBeNull();
    });

    it('keeps an old webhook row when a webhook Credential is bound', async () => {
      const { service, dataDestinationCredentialService } = createService(
        makeTarget({
          type: DataDestinationType.GOOGLE_CHAT,
          credentialId: 'row-webhook',
          credential: {
            id: 'row-webhook',
            type: DestinationCredentialType.GOOGLE_CHAT_WEBHOOK,
            credentials: { type: 'google-chat-credentials', webhookUrl },
          },
        })
      );

      await service.run(makeCommand({ reusableCredentialId: 'credential-1' }));

      expect(dataDestinationCredentialService.softDelete).not.toHaveBeenCalled();
    });

    it('stores email recipients and deactivates the webhook binding', async () => {
      const {
        service,
        destinationCredentials,
        dataDestinationCredentialService,
        dataDestinationRepository,
      } = createService(makeTarget({ type: DataDestinationType.GOOGLE_CHAT }));
      const credentials = { type: 'email-credentials' as const, to: ['space@example.com'] };

      await service.run(makeCommand({ credentials }));

      expect(destinationCredentials.deactivateDestination).toHaveBeenCalledWith(targetId);
      expect(dataDestinationCredentialService.create).toHaveBeenCalledWith({
        projectId,
        type: DestinationCredentialType.EMAIL,
        credentials,
        identity: null,
      });
      expect(dataDestinationRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ credentialId: 'row-new' })
      );
      expect(destinationCredentials.bindDestination).not.toHaveBeenCalled();
    });

    it('refuses a plugin whose email recipients would replace a bound webhook Credential', async () => {
      const {
        service,
        destinationCredentials,
        dataDestinationCredentialService,
        dataDestinationRepository,
      } = createService(makeTarget({ type: DataDestinationType.GOOGLE_CHAT }));
      destinationCredentials.findBoundDestinationIds.mockResolvedValue(new Set([targetId]));
      const credentials = { type: 'email-credentials' as const, to: ['space@example.com'] };

      await expect(service.run(makeCommand({ credentials, isPluginCall: true }))).rejects.toThrow(
        new ForbiddenException("Plugins cannot change a Destination's Credential.")
      );
      expect(destinationCredentials.findBoundDestinationIds).toHaveBeenCalledWith(projectId, [
        targetId,
      ]);
      expect(destinationCredentials.deactivateDestination).not.toHaveBeenCalled();
      expect(dataDestinationCredentialService.create).not.toHaveBeenCalled();
      expect(dataDestinationCredentialService.update).not.toHaveBeenCalled();
      expect(dataDestinationRepository.save).not.toHaveBeenCalled();
    });

    it('refuses a plugin whose email recipients would replace an old webhook row', async () => {
      const {
        service,
        destinationCredentials,
        dataDestinationCredentialService,
        dataDestinationRepository,
      } = createService(
        makeTarget({
          type: DataDestinationType.GOOGLE_CHAT,
          credentialId: 'row-webhook',
          credential: {
            id: 'row-webhook',
            type: DestinationCredentialType.GOOGLE_CHAT_WEBHOOK,
            credentials: { type: 'google-chat-credentials', webhookUrl },
          },
        })
      );
      const credentials = { type: 'email-credentials' as const, to: ['space@example.com'] };

      await expect(service.run(makeCommand({ credentials, isPluginCall: true }))).rejects.toThrow(
        new ForbiddenException("Plugins cannot change a Destination's Credential.")
      );
      expect(destinationCredentials.deactivateDestination).not.toHaveBeenCalled();
      expect(dataDestinationCredentialService.update).not.toHaveBeenCalled();
      expect(dataDestinationRepository.save).not.toHaveBeenCalled();
    });

    it('lets a plugin change the recipients of a Destination delivered by email', async () => {
      const { service, destinationCredentials, dataDestinationCredentialService } = createService(
        makeTarget({
          type: DataDestinationType.GOOGLE_CHAT,
          credentialId: 'row-email',
          credential: emailRow,
        })
      );
      const credentials = { type: 'email-credentials' as const, to: ['new@example.com'] };

      await service.run(makeCommand({ credentials, isPluginCall: true }));

      expect(dataDestinationCredentialService.update).toHaveBeenCalledWith('row-email', {
        type: DestinationCredentialType.EMAIL,
        credentials,
        identity: null,
      });
      expect(destinationCredentials.deactivateDestination).toHaveBeenCalledWith(targetId);
    });

    it('updates the email recipients in place on the existing row', async () => {
      const { service, dataDestinationCredentialService } = createService(
        makeTarget({
          type: DataDestinationType.GOOGLE_CHAT,
          credentialId: 'row-email',
          credential: emailRow,
        })
      );
      const credentials = { type: 'email-credentials' as const, to: ['new@example.com'] };

      await service.run(makeCommand({ credentials }));

      expect(dataDestinationCredentialService.update).toHaveBeenCalledWith('row-email', {
        type: DestinationCredentialType.EMAIL,
        credentials,
        identity: null,
      });
    });

    it('tells an older page that sends a webhook URL to reload', async () => {
      const { service, dataDestinationCredentialService } = createService(
        makeTarget({ type: DataDestinationType.GOOGLE_CHAT })
      );

      await expect(
        service.run(makeCommand({ credentials: { type: 'google-chat-credentials', webhookUrl } }))
      ).rejects.toThrow(STALE);
      expect(dataDestinationCredentialService.update).not.toHaveBeenCalled();
    });

    it('keeps the delivery method when an update sends neither', async () => {
      const {
        service,
        credentialsProcessor,
        dataDestinationCredentialService,
        destinationCredentials,
      } = createService(makeTarget({ type: DataDestinationType.GOOGLE_CHAT }));

      await service.run(makeCommand());

      expect(credentialsProcessor.processCredentials).not.toHaveBeenCalled();
      expect(dataDestinationCredentialService.update).not.toHaveBeenCalled();
      expect(destinationCredentials.deactivateDestination).not.toHaveBeenCalled();
      expect(destinationCredentials.bindDestination).not.toHaveBeenCalled();
    });
  });

  it('leaves Credential bindings alone when an Email Destination changes its recipients', async () => {
    const { service, destinationCredentials, dataDestinationCredentialService } = createService(
      makeTarget({ type: DataDestinationType.EMAIL })
    );
    const credentials = { type: 'email-credentials' as const, to: ['team@example.com'] };

    await service.run(makeCommand({ credentials }));

    expect(dataDestinationCredentialService.create).toHaveBeenCalled();
    expect(destinationCredentials.deactivateDestination).not.toHaveBeenCalled();
    expect(destinationCredentials.findBoundDestinationIds).not.toHaveBeenCalled();
  });

  it.each([
    [DataDestinationType.SLACK, { type: 'email-credentials', to: ['team@example.com'] }],
    [DataDestinationType.MS_TEAMS, { type: 'email-credentials', to: ['team@example.com'] }],
  ])(
    'leaves Credential bindings alone when a %s Destination changes its inline credentials',
    async (type, credentials) => {
      const { service, destinationCredentials, dataDestinationCredentialService } = createService(
        makeTarget({ type })
      );

      await service.run(makeCommand({ credentials }));

      expect(dataDestinationCredentialService.create).toHaveBeenCalled();
      expect(destinationCredentials.checkDestinationBinding).not.toHaveBeenCalled();
      expect(destinationCredentials.bindDestination).not.toHaveBeenCalled();
      expect(destinationCredentials.deactivateDestination).not.toHaveBeenCalled();
    }
  );

  it('rejects inline credentials on a credentialless destination type', async () => {
    const { service, credentialsValidator } = createService(
      makeTarget({ type: DataDestinationType.EXCEL })
    );

    await expect(
      service.run(makeCommand({ credentials: { type: 'google-sheets-credentials' } }))
    ).rejects.toThrow(/do not use credentials/);
    expect(credentialsValidator.checkCredentials).not.toHaveBeenCalled();
  });

  it('still allows a plain rename of a credentialless destination', async () => {
    const { service } = createService(makeTarget({ type: DataDestinationType.EXCEL }));

    await expect(service.run(makeCommand())).resolves.toBeDefined();
  });

  it('re-syncs the report search index so report entries pick up the destination rename', async () => {
    const { service, advancedSearchIndexSync } = createService(
      makeTarget({ type: DataDestinationType.EXCEL, title: 'Old destination title' })
    );

    await service.run(makeCommand());

    expect(advancedSearchIndexSync.scheduleReindex).toHaveBeenCalledWith(
      SearchableEntityType.DATA_DESTINATION,
      targetId,
      projectId
    );
    expect(advancedSearchIndexSync.scheduleReportsReindex).toHaveBeenCalledWith(
      SearchableEntityType.DATA_DESTINATION,
      targetId,
      projectId
    );
    expect(advancedSearchIndexSync.scheduleTypeProjectSync).not.toHaveBeenCalled();
  });

  it('does not re-sync reports when a destination update keeps the same title', async () => {
    const { service, advancedSearchIndexSync } = createService(
      makeTarget({ type: DataDestinationType.EXCEL })
    );

    await service.run(makeCommand({ availableForUse: false }));

    expect(advancedSearchIndexSync.scheduleTypeProjectSync).not.toHaveBeenCalled();
    expect(advancedSearchIndexSync.scheduleReportsReindex).not.toHaveBeenCalled();
  });

  describe('permission checks', () => {
    it('throws ForbiddenException with the required-role message when managing owners is denied', async () => {
      const { service, accessDecisionService } = createService();
      accessDecisionService.canAccess.mockResolvedValue(false);

      await expect(service.run(makeCommand({ ownerIds: ['user-2'] }))).rejects.toThrow(
        'You do not have permission to manage owners of this Destination. You must be an owner of this Destination, or a Project Admin.'
      );
    });

    it('throws ForbiddenException with the required-role message when configuring sharing is denied', async () => {
      const { service, accessDecisionService } = createService();
      accessDecisionService.canAccess.mockResolvedValue(false);

      await expect(service.run(makeCommand({ availableForMaintenance: true }))).rejects.toThrow(
        'You do not have permission to configure sharing for this Destination. You must be an owner of this Destination, or a Project Admin.'
      );
    });
  });

  describe('Drive folder validation (only on folder change)', () => {
    it('skips folder validation when config is not provided (folder untouched)', async () => {
      const { service, folderValidator } = createService(
        makeTarget({ config: { folderId: 'folder-x' } })
      );

      await service.run(makeCommand());

      expect(folderValidator.validateConfiguredFolder).not.toHaveBeenCalled();
    });

    it('skips folder validation when the configured folderId is unchanged', async () => {
      const { service, folderValidator } = createService(
        makeTarget({ config: { folderId: 'folder-x', folderUrl: 'https://drive/x' } })
      );

      // Same folderId, only the (derived) folderUrl differs — no Drive round-trip.
      await service.run(makeCommand({ config: { folderId: 'folder-x', folderUrl: 'https://x' } }));

      expect(folderValidator.validateConfiguredFolder).not.toHaveBeenCalled();
    });

    it('validates the folder when the configured folderId changes', async () => {
      const { service, target, folderValidator } = createService(
        makeTarget({ config: { folderId: 'folder-old' } })
      );

      await service.run(makeCommand({ config: { folderId: 'folder-new' } }));

      expect(folderValidator.validateConfiguredFolder).toHaveBeenCalledTimes(1);
      expect(folderValidator.validateConfiguredFolder).toHaveBeenCalledWith(
        expect.objectContaining({ id: target.id, config: { folderId: 'folder-new' } }),
        undefined
      );
    });

    it('validates the folder when one is newly configured on a destination that had none', async () => {
      const { service, folderValidator } = createService(makeTarget({ config: null }));

      await service.run(makeCommand({ config: { folderId: 'folder-new' } }));

      expect(folderValidator.validateConfiguredFolder).toHaveBeenCalledTimes(1);
    });

    it('fails fast (rolls back) when the changed folder is not usable', async () => {
      const { service, folderValidator } = createService(
        makeTarget({ config: { folderId: 'folder-old' } })
      );
      folderValidator.validateConfiguredFolder.mockRejectedValue(
        new Error('folder not accessible')
      );

      await expect(
        service.run(makeCommand({ config: { folderId: 'folder-bad' } }))
      ).rejects.toThrow('folder not accessible');
    });
  });
  describe('Destination row lock', () => {
    it('reads the Destination under a write lock on MySQL before binding', async () => {
      const { service, dataDestinationRepository, destinationCredentials } = createService();
      dataDestinationRepository.manager.connection.options.type = 'mysql';

      await service.run(makeCommand({ reusableCredentialId: 'credential-1' }));

      expect(dataDestinationRepository.findOne).toHaveBeenCalledWith({
        where: { id: targetId, projectId },
        loadEagerRelations: false,
        lock: { mode: 'pessimistic_write' },
      });
      expect(dataDestinationRepository.findOne.mock.invocationCallOrder[0]).toBeLessThan(
        destinationCredentials.bindDestination.mock.invocationCallOrder[0]
      );
    });

    it('takes the lock before any other read, so later reads see what the lock saw', async () => {
      const { service, dataDestinationRepository, dataDestinationService, accessDecisionService } =
        createService();
      dataDestinationRepository.manager.connection.options.type = 'mysql';

      await service.run(makeCommand({ ownerIds: [], availableForUse: true }));

      const lockOrder = dataDestinationRepository.findOne.mock.invocationCallOrder[0];
      expect(lockOrder).toBeLessThan(accessDecisionService.canAccess.mock.invocationCallOrder[0]);
      expect(lockOrder).toBeLessThan(
        dataDestinationService.getByIdAndProjectId.mock.invocationCallOrder[0]
      );
    });

    it('answers 404 and binds nothing when the Destination was deleted meanwhile', async () => {
      const { service, dataDestinationRepository, destinationCredentials } = createService();
      dataDestinationRepository.manager.connection.options.type = 'mysql';
      dataDestinationRepository.findOne.mockResolvedValue(null);

      await expect(
        service.run(makeCommand({ reusableCredentialId: 'credential-1' }))
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(destinationCredentials.checkDestinationBinding).not.toHaveBeenCalled();
      expect(destinationCredentials.bindDestination).not.toHaveBeenCalled();
      expect(dataDestinationRepository.save).not.toHaveBeenCalled();
    });

    it("compares the folder with the locked row's, not the older read", async () => {
      const { service, dataDestinationRepository, folderValidator } = createService(
        makeTarget({ config: { folderId: 'folder-old' } })
      );
      dataDestinationRepository.manager.connection.options.type = 'mysql';
      // A save that waited for the lock finds the folder the first save committed.
      dataDestinationRepository.findOne.mockResolvedValue({
        id: targetId,
        config: { folderId: 'folder-new' },
      });

      await service.run(makeCommand({ config: { folderId: 'folder-new' } }));

      expect(folderValidator.validateConfiguredFolder).not.toHaveBeenCalled();
    });

    it('keeps the plain read on SQLite', async () => {
      const { service, dataDestinationRepository, dataDestinationService } = createService();

      await service.run(makeCommand({ reusableCredentialId: 'credential-1' }));

      expect(dataDestinationRepository.findOne).not.toHaveBeenCalled();
      expect(dataDestinationService.getByIdAndProjectId).toHaveBeenCalledWith(targetId, projectId);
    });
  });

  describe('Drive folder when the Credential changes', () => {
    const folder = {
      folderId: 'folder-x',
      folderUrl: 'https://drive.google.com/drive/folders/folder-x',
    };

    const rebind = async (
      before: object | null | undefined,
      chosen: object,
      sent: { config?: DestinationConfigOverride } = { config: folder },
      credential: object | null = null
    ) => {
      const created = createService(makeTarget({ config: folder, credential }));
      if (before !== undefined) {
        created.destinationCredentials.lockedPublicOfDestination.mockResolvedValue(before);
      }
      const candidate = candidateOf(chosen, 'credential-2');
      created.destinationCredentials.checkDestinationBinding.mockResolvedValue(candidate);
      await created.service.run(makeCommand({ reusableCredentialId: 'credential-2', ...sent }));
      return { ...created, candidate };
    };

    it.each([
      [
        'one Google account to another',
        googleAccount('ann@example.com'),
        googleAccount('bob@example.com'),
      ],
      [
        'a Google account to a service account',
        googleAccount('ann@example.com'),
        serviceAccountKey,
      ],
      [
        'a service account to a Google account',
        serviceAccountKey,
        googleAccount('ann@example.com'),
      ],
      ['a service account to a service account', serviceAccountKey, serviceAccountKey],
      [
        'the same Google account',
        googleAccount('ann@example.com'),
        googleAccount('Ann@example.com'),
      ],
      ['a bound Credential that is gone', null, googleAccount('bob@example.com')],
    ])(
      'keeps the folder the save sends from %s and checks it with the chosen Credential',
      async (_case, before, chosen) => {
        const { dataDestinationRepository, folderValidator, destinationCredentials, candidate } =
          await rebind(before, chosen);

        expect(destinationCredentials.lockedPublicOfDestination).not.toHaveBeenCalled();
        expect(dataDestinationRepository.save).toHaveBeenCalledWith(
          expect.objectContaining({ config: folder })
        );
        expect(folderValidator.validateConfiguredFolder).toHaveBeenCalledWith(
          expect.objectContaining({ config: folder }),
          candidate
        );
      }
    );

    it('refuses a service account that cannot use the folder the save sends', async () => {
      const created = createService(makeTarget({ config: folder }));
      created.destinationCredentials.lockedPublicOfDestination.mockResolvedValue(
        googleAccount('ann@example.com')
      );
      created.destinationCredentials.checkDestinationBinding.mockResolvedValue(
        candidateOf(serviceAccountKey, 'credential-2')
      );
      // As the real check answers a My Drive folder picked by a Google account.
      created.folderValidator.validateConfiguredFolder.mockRejectedValue(
        new Error('My Drive folders are not supported.')
      );

      await expect(
        created.service.run(makeCommand({ reusableCredentialId: 'credential-2', config: folder }))
      ).rejects.toThrow('My Drive folders are not supported.');
      expect(created.destinationCredentials.bindDestination).not.toHaveBeenCalled();
    });

    it.each([
      [
        'one Google account to another',
        googleAccount('ann@example.com'),
        googleAccount('bob@example.com'),
      ],
      [
        'a Google account to a service account',
        googleAccount('ann@example.com'),
        serviceAccountKey,
      ],
    ])(
      'clears the folder from %s when the save does not send one',
      async (_case, before, chosen) => {
        const { dataDestinationRepository, folderValidator } = await rebind(before, chosen, {});

        expect(dataDestinationRepository.save).toHaveBeenCalledWith(
          expect.objectContaining({ config: null })
        );
        expect(folderValidator.validateConfiguredFolder).toHaveBeenCalledWith(
          expect.objectContaining({ config: null }),
          expect.anything()
        );
      }
    );

    it("compares with an unbound Destination's old Google account row", async () => {
      const { dataDestinationRepository, destinationCredentials } = await rebind(
        undefined,
        googleAccount('bob@example.com'),
        {},
        {
          id: 'row-oauth',
          type: DestinationCredentialType.GOOGLE_OAUTH,
          identity: { email: 'ann@example.com' },
        }
      );

      expect(destinationCredentials.lockedPublicOfDestination).toHaveBeenCalledWith(
        projectId,
        targetId
      );
      expect(dataDestinationRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ config: null })
      );
    });

    it.each([
      ['a service account to a service account', serviceAccountKey, serviceAccountKey, null],
      [
        'the same Google account',
        googleAccount('ann@example.com'),
        googleAccount('Ann@example.com'),
        null,
      ],
      [
        'a Google account whose email is unknown',
        { definitionId: 'google-sheets-oauth', publicMetadata: null },
        googleAccount('bob@example.com'),
        null,
      ],
      [
        'an old Google account row without an email',
        undefined,
        googleAccount('bob@example.com'),
        { id: 'row-oauth', type: DestinationCredentialType.GOOGLE_OAUTH, identity: null },
      ],
      [
        'a Google account to one whose email is unknown',
        googleAccount('ann@example.com'),
        { definitionId: 'google-sheets-oauth', publicMetadata: null },
        null,
      ],
    ])(
      'keeps the folder from %s when the save does not send one',
      async (_case, before, chosen, credential) => {
        const { dataDestinationRepository } = await rebind(before, chosen, {}, credential);

        expect(dataDestinationRepository.save).toHaveBeenCalledWith(
          expect.objectContaining({ config: folder })
        );
      }
    );

    it('takes the bound Credential sent again as no change', async () => {
      const created = createService(makeTarget({ config: folder }));
      created.destinationCredentials.boundCredentialIdOfDestination.mockResolvedValue(
        'credential-2'
      );

      await created.service.run(makeCommand({ reusableCredentialId: 'credential-2' }));

      expect(created.destinationCredentials.boundCredentialIdOfDestination).toHaveBeenCalledWith(
        projectId,
        targetId
      );
      expect(created.destinationCredentials.checkDestinationBinding).not.toHaveBeenCalled();
      expect(created.destinationCredentials.lockedPublicOfDestination).not.toHaveBeenCalled();
      expect(created.folderValidator.validateConfiguredFolder).not.toHaveBeenCalled();
      expect(created.destinationCredentials.bindDestination).not.toHaveBeenCalled();
      expect(created.dataDestinationRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ config: folder })
      );
    });

    it('keeps a new folder set in the same save and checks it', async () => {
      const next = {
        folderId: 'folder-y',
        folderUrl: 'https://drive.google.com/drive/folders/folder-y',
      };
      const { dataDestinationRepository, folderValidator, destinationCredentials, candidate } =
        await rebind(googleAccount('ann@example.com'), serviceAccountKey, { config: next });

      expect(destinationCredentials.lockedPublicOfDestination).not.toHaveBeenCalled();
      expect(dataDestinationRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ config: next })
      );
      expect(folderValidator.validateConfiguredFolder).toHaveBeenCalledWith(
        expect.objectContaining({ config: next }),
        candidate
      );
    });
  });
});
