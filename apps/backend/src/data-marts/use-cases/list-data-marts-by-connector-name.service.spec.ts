import { ListDataMartsByConnectorNameCommand } from '../dto/domain/list-data-mart-by-connector-name';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { RoleScope } from '../enums/role-scope.enum';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { ContextAccessService } from '../services/context/context-access.service';
import { DataMartService } from '../services/data-mart.service';
import { ListDataMartsByConnectorNameService } from './list-data-marts-by-connector-name.service';

describe('ListDataMartsByConnectorNameService', () => {
  const dataMartService = {
    findByProjectIdAndDefinitionType: jest.fn(),
    findVisibleIdsByProjectIdAndIds: jest.fn(),
  };
  const mapper = { toDomainDto: jest.fn((dm: { id: string }) => ({ id: dm.id })) };
  const contextAccessService = { getRoleScope: jest.fn() };

  const service = new ListDataMartsByConnectorNameService(
    dataMartService as unknown as DataMartService,
    mapper as unknown as DataMartMapper,
    contextAccessService as unknown as ContextAccessService
  );

  const connectorDataMart = (id: string, name: string) => ({
    id,
    definitionType: DataMartDefinitionType.CONNECTOR,
    definition: { connector: { source: { name } } },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    dataMartService.findByProjectIdAndDefinitionType.mockResolvedValue([
      connectorDataMart('visible', 'RedditAds'),
      connectorDataMart('hidden', 'RedditAds'),
      connectorDataMart('other-connector', 'FacebookMarketing'),
    ]);
    dataMartService.findVisibleIdsByProjectIdAndIds.mockResolvedValue(['visible']);
  });

  it('lists only the Data Marts of the connector the member can see, in one visibility query', async () => {
    contextAccessService.getRoleScope.mockResolvedValue(RoleScope.SELECTED_CONTEXTS);

    const result = await service.run(
      new ListDataMartsByConnectorNameCommand('RedditAds', 'project-1', 'user-1', ['viewer'])
    );

    expect(result).toEqual([{ id: 'visible' }]);
    expect(contextAccessService.getRoleScope).toHaveBeenCalledTimes(1);
    expect(contextAccessService.getRoleScope).toHaveBeenCalledWith('user-1', 'project-1');
    expect(dataMartService.findVisibleIdsByProjectIdAndIds).toHaveBeenCalledTimes(1);
    expect(dataMartService.findVisibleIdsByProjectIdAndIds).toHaveBeenCalledWith(
      'project-1',
      ['visible', 'hidden'],
      { userId: 'user-1', roles: ['viewer'], roleScope: RoleScope.SELECTED_CONTEXTS }
    );
  });

  it('gives an admin the whole project without reading a role scope', async () => {
    await service.run(
      new ListDataMartsByConnectorNameCommand('RedditAds', 'project-1', 'user-0', ['admin'])
    );

    expect(contextAccessService.getRoleScope).not.toHaveBeenCalled();
    expect(dataMartService.findVisibleIdsByProjectIdAndIds).toHaveBeenCalledWith(
      'project-1',
      ['visible', 'hidden'],
      { userId: 'user-0', roles: ['admin'], roleScope: RoleScope.ENTIRE_PROJECT }
    );
  });

  it('asks nothing more when no Data Mart uses the connector', async () => {
    const result = await service.run(
      new ListDataMartsByConnectorNameCommand('TikTokAds', 'project-1', 'user-1', ['viewer'])
    );

    expect(result).toEqual([]);
    expect(contextAccessService.getRoleScope).not.toHaveBeenCalled();
    expect(dataMartService.findVisibleIdsByProjectIdAndIds).not.toHaveBeenCalled();
  });
});
