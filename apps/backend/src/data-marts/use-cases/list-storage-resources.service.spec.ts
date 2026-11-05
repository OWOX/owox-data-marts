import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { StorageResourceBrowserFacade } from '../data-storage-types/facades/storage-resource-browser.facade';
import {
  ListStorageResourcesCommand,
  StorageResourceLevel,
} from '../dto/domain/list-storage-resources.command';
import { Action, EntityType } from '../services/access-decision';
import { ListStorageResourcesService } from './list-storage-resources.service';

describe('ListStorageResourcesService', () => {
  const storage = {
    id: 'storage',
    type: DataStorageType.GOOGLE_BIGQUERY,
    config: { projectId: 'test-project', location: 'US' },
  };
  const command = new ListStorageResourcesCommand(
    'storage',
    'project',
    'user',
    ['editor'],
    StorageResourceLevel.NAMESPACES
  );

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  function create() {
    const storages = { getByProjectIdAndId: jest.fn().mockResolvedValue(storage) };
    const access = { canAccess: jest.fn().mockResolvedValue(true) };
    const browser = {
      listNamespaces: jest.fn().mockResolvedValue([{ id: 'gcp-project', label: 'Project' }]),
      listLeafResources: jest.fn().mockResolvedValue([
        {
          id: 'orders',
          groupId: 'analytics',
          type: 'TABLE',
          fullyQualifiedName: 'gcp-project.analytics.orders',
          location: 'EU',
          locationMismatch: true,
        },
      ]),
    };
    return {
      service: new ListStorageResourcesService(
        storages as never,
        access as never,
        browser as never
      ),
      storages,
      access,
      browser,
    };
  }

  it('returns namespaces after checking project-scoped USE access', async () => {
    const { service, storages, access } = create();

    await expect(service.run(command)).resolves.toEqual({
      namespaces: [{ id: 'gcp-project', label: 'Project' }],
    });
    expect(storages.getByProjectIdAndId).toHaveBeenCalledWith('project', 'storage');
    expect(access.canAccess).toHaveBeenCalledWith(
      'user',
      ['editor'],
      EntityType.STORAGE,
      'storage',
      Action.USE,
      'project'
    );
  });

  it('returns resource metadata and passes the namespace and resource filter', async () => {
    const { service, browser } = create();

    await expect(
      service.run({
        ...command,
        level: StorageResourceLevel.RESOURCES,
        namespaceId: 'gcp-project',
        resourceType: 'TABLE_PATTERN',
      })
    ).resolves.toEqual({
      resources: [
        {
          id: 'orders',
          groupId: 'analytics',
          type: 'TABLE',
          fullyQualifiedName: 'gcp-project.analytics.orders',
          location: 'EU',
          locationMismatch: true,
        },
      ],
    });
    expect(browser.listLeafResources).toHaveBeenCalledWith(storage, 'gcp-project', 'TABLE_PATTERN');
  });

  it('requires USE before inspecting configuration or calling the provider', async () => {
    const { service, storages, access, browser } = create();
    storages.getByProjectIdAndId.mockResolvedValue({ ...storage, config: null });
    access.canAccess.mockResolvedValue(false);

    await expect(service.run(command)).rejects.toBeInstanceOf(ForbiddenException);
    expect(browser.listNamespaces).not.toHaveBeenCalled();
    expect(browser.listLeafResources).not.toHaveBeenCalled();
  });

  it('does not browse a Storage from another project', async () => {
    const { service, storages, browser } = create();
    storages.getByProjectIdAndId.mockRejectedValue(new NotFoundException());

    await expect(service.run(command)).rejects.toBeInstanceOf(NotFoundException);
    expect(browser.listNamespaces).not.toHaveBeenCalled();
  });

  it('requires saved configuration before calling the provider', async () => {
    const { service, storages, browser } = create();
    storages.getByProjectIdAndId.mockResolvedValue({ ...storage, config: null });

    await expect(service.run(command)).rejects.toThrow(
      new BadRequestException('Configure this Storage before listing resources.')
    );
    expect(browser.listNamespaces).not.toHaveBeenCalled();
  });

  it('requires a namespace before listing resources', async () => {
    const { service, browser } = create();

    await expect(
      service.run({ ...command, level: StorageResourceLevel.RESOURCES })
    ).rejects.toThrow(new BadRequestException('namespaceId is required for level=resources'));
    expect(browser.listLeafResources).not.toHaveBeenCalled();
  });

  it('rejects unsupported Storage types through the shared provider facade', async () => {
    const { storages, access } = create();
    storages.getByProjectIdAndId.mockResolvedValue({ ...storage, type: DataStorageType.SNOWFLAKE });
    const browser = new StorageResourceBrowserFacade({
      tryResolve: jest.fn().mockResolvedValue(undefined),
    } as never);
    const service = new ListStorageResourcesService(storages as never, access as never, browser);

    await expect(service.run(command)).rejects.toThrow(
      new BadRequestException('Resource browsing is not supported for storage type: SNOWFLAKE')
    );
  });

  it.each([
    new BadRequestException('Provider does not support the request'),
    new ForbiddenException('Provider denied access'),
    new UnauthorizedException('Provider authorization expired'),
  ])('preserves HTTP errors from the provider: %s', async error => {
    const { service, browser } = create();
    browser.listNamespaces.mockRejectedValue(error);

    await expect(service.run(command)).rejects.toBe(error);
  });

  it.each([
    [{ code: 401 }, UnauthorizedException],
    [{ status: '403' }, ForbiddenException],
    [new Error('Timed out after 15000ms'), ServiceUnavailableException],
    [new Error('Provider is unavailable'), BadGatewayException],
  ])('maps provider errors to HTTP status: %j', async (error, expected) => {
    const { service, browser } = create();
    browser.listNamespaces.mockRejectedValue(error);

    await expect(service.run(command)).rejects.toBeInstanceOf(expected);
  });
});
