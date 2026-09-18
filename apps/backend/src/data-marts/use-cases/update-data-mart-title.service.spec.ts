import { UpdateDataMartTitleService } from './update-data-mart-title.service';
import { UpdateDataMartTitleCommand } from '../dto/domain/update-data-mart-title.command';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { SearchableEntityType } from '../../common/search/search.facade';

describe('UpdateDataMartTitleService', () => {
  const createService = () => {
    const dataMart = {
      id: 'dm-1',
      title: 'Old title',
      storage: { type: DataStorageType.GOOGLE_BIGQUERY },
    };
    const dataMartService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue(dataMart),
      save: jest.fn().mockResolvedValue(dataMart),
    };
    const mapper = { toDomainDto: jest.fn().mockReturnValue({ id: 'dm-1' }) };
    const legacyDataMartsService = { updateTitle: jest.fn() };
    const accessDecisionService = { canAccess: jest.fn().mockResolvedValue(true) };
    const advancedSearchIndexSync = {
      scheduleReindex: jest.fn().mockResolvedValue(undefined),
      scheduleTypeProjectSync: jest.fn().mockResolvedValue(undefined),
      scheduleReportsReindex: jest.fn().mockResolvedValue(undefined),
    };

    const service = new UpdateDataMartTitleService(
      dataMartService as never,
      mapper as never,
      legacyDataMartsService as never,
      accessDecisionService as never,
      advancedSearchIndexSync as never
    );

    return { service, dataMartService, advancedSearchIndexSync };
  };

  it('saves the new title and reindexes the data mart', async () => {
    const { service, dataMartService, advancedSearchIndexSync } = createService();

    await service.run(
      new UpdateDataMartTitleCommand('dm-1', 'proj-1', 'New title', 'user-1', ['editor'])
    );

    expect(dataMartService.save).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'New title' })
    );
    expect(advancedSearchIndexSync.scheduleReindex).toHaveBeenCalledWith(
      SearchableEntityType.DATA_MART,
      'dm-1',
      'proj-1'
    );
  });

  it('re-syncs the report search index so report entries pick up the new data mart title', async () => {
    const { service, advancedSearchIndexSync } = createService();

    await service.run(
      new UpdateDataMartTitleCommand('dm-1', 'proj-1', 'New title', 'user-1', ['editor'])
    );

    expect(advancedSearchIndexSync.scheduleReportsReindex).toHaveBeenCalledWith(
      SearchableEntityType.DATA_MART,
      'dm-1',
      'proj-1'
    );
    expect(advancedSearchIndexSync.scheduleTypeProjectSync).not.toHaveBeenCalled();
  });

  it('does not re-sync reports when the data mart title is unchanged', async () => {
    const { service, advancedSearchIndexSync } = createService();

    await service.run(
      new UpdateDataMartTitleCommand('dm-1', 'proj-1', 'Old title', 'user-1', ['editor'])
    );

    expect(advancedSearchIndexSync.scheduleTypeProjectSync).not.toHaveBeenCalled();
    expect(advancedSearchIndexSync.scheduleReportsReindex).not.toHaveBeenCalled();
  });
});
