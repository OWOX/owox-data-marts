import { Test, TestingModule } from '@nestjs/testing';
import { DataMartEventsListener } from './data-mart-events.listener';
import { SearchIndexerService } from './search-indexer.service';
import { EeLicenseService } from '../../shared/ee-license.service';

async function buildListener(licensed: boolean): Promise<{
  listener: DataMartEventsListener;
  indexer: jest.Mocked<Pick<SearchIndexerService, 'reindexDataMart' | 'reconcile'>>;
}> {
  const indexer = {
    reindexDataMart: jest.fn().mockResolvedValue(undefined),
    reconcile: jest.fn().mockResolvedValue(undefined),
  };
  const eeLicense = {
    isLicensed: jest.fn().mockReturnValue(licensed),
    verifyLicensed: jest.fn(),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      DataMartEventsListener,
      { provide: SearchIndexerService, useValue: indexer },
      { provide: EeLicenseService, useValue: eeLicense },
    ],
  }).compile();

  return {
    listener: module.get(DataMartEventsListener),
    indexer: indexer as jest.Mocked<Pick<SearchIndexerService, 'reindexDataMart' | 'reconcile'>>,
  };
}

describe('DataMartEventsListener', () => {
  describe('when licensed', () => {
    it('onCreated triggers reindex with dataMartId and projectId', async () => {
      const { listener, indexer } = await buildListener(true);
      await listener.onCreated({ dataMartId: 'dm-1', projectId: 'proj-1', createdById: 'u-1' });
      expect(indexer.reindexDataMart).toHaveBeenCalledWith('dm-1', 'proj-1');
    });

    it('onPublished triggers reindex with dataMartId and projectId', async () => {
      const { listener, indexer } = await buildListener(true);
      const { DataMartStatus } = await import('../../../data-marts/enums/data-mart-status.enum');
      await listener.onPublished({
        dataMartId: 'dm-2',
        projectId: 'proj-1',
        createdById: 'u-1',
        previousStatus: DataMartStatus.DRAFT,
      });
      expect(indexer.reindexDataMart).toHaveBeenCalledWith('dm-2', 'proj-1');
    });

    it('onDefinitionSet triggers reindex with dataMartId and projectId', async () => {
      const { listener, indexer } = await buildListener(true);
      await listener.onDefinitionSet({
        dataMartId: 'dm-3',
        projectId: 'proj-1',
        createdById: 'u-1',
      });
      expect(indexer.reindexDataMart).toHaveBeenCalledWith('dm-3', 'proj-1');
    });

    it('does not throw when reindex fails', async () => {
      const { listener, indexer } = await buildListener(true);
      indexer.reindexDataMart.mockRejectedValue(new Error('embed error'));
      await expect(
        listener.onCreated({ dataMartId: 'dm-1', projectId: 'proj-1', createdById: 'u-1' })
      ).resolves.not.toThrow();
    });
  });

  describe('when unlicensed', () => {
    it('ignores all events', async () => {
      const { listener, indexer } = await buildListener(false);
      await listener.onCreated({ dataMartId: 'dm-1', projectId: 'proj-1', createdById: 'u-1' });
      await listener.onPublished({
        dataMartId: 'dm-2',
        projectId: 'proj-1',
        createdById: 'u-1',
        previousStatus: 'DRAFT' as never,
      });
      await listener.onDefinitionSet({
        dataMartId: 'dm-3',
        projectId: 'proj-1',
        createdById: 'u-1',
      });
      expect(indexer.reindexDataMart).not.toHaveBeenCalled();
    });
  });

  it('event name for created is data-mart.created', () => {
    const meta = Reflect.getMetadata(
      'EVENT_LISTENER_METADATA',
      DataMartEventsListener.prototype.onCreated
    );
    expect(meta).toBeDefined();
  });
});
