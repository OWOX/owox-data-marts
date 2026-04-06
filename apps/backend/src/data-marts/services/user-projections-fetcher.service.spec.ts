import { UserProjectionDto } from '../../idp/dto/domain/user-projection.dto';
import { UserProjectionsListDto } from '../../idp/dto/domain/user-projections-list.dto';
import { CreatorAwareEntity } from '../entities/creator-aware-entity.interface';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartBusinessOwner } from '../entities/data-mart-business-owner.entity';
import { DataMartTechnicalOwner } from '../entities/data-mart-technical-owner.entity';
import { UserProjectionsFetcherService } from './user-projections-fetcher.service';

jest.mock('../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

describe('UserProjectionsFetcherService', () => {
  const createService = () => {
    const idpProjectionsFacade = {
      getUserProjectionList: jest.fn(),
    };

    const service = new UserProjectionsFetcherService(idpProjectionsFacade as never);

    return { service, idpProjectionsFacade };
  };

  describe('fetchRelevantUserProjections', () => {
    it('should pass valid string createdById values to facade', async () => {
      const { service, idpProjectionsFacade } = createService();
      const projection = new UserProjectionDto('user-1', 'Alice', 'alice@test.com', null);
      idpProjectionsFacade.getUserProjectionList.mockResolvedValue(
        new UserProjectionsListDto([projection])
      );

      const entities: CreatorAwareEntity[] = [{ createdById: 'user-1' }, { createdById: 'user-2' }];

      const result = await service.fetchRelevantUserProjections(entities);

      expect(idpProjectionsFacade.getUserProjectionList).toHaveBeenCalledWith(['user-1', 'user-2']);
      expect(result.projections).toEqual([projection]);
    });

    it('should filter out null createdById (nullable DB column)', async () => {
      const { service, idpProjectionsFacade } = createService();
      idpProjectionsFacade.getUserProjectionList.mockResolvedValue(new UserProjectionsListDto([]));

      const entities = [
        { createdById: 'user-1' },
        { createdById: null as unknown as string },
        { createdById: 'user-3' },
      ];

      await service.fetchRelevantUserProjections(entities);

      expect(idpProjectionsFacade.getUserProjectionList).toHaveBeenCalledWith(['user-1', 'user-3']);
    });

    it('should filter out undefined createdById', async () => {
      const { service, idpProjectionsFacade } = createService();
      idpProjectionsFacade.getUserProjectionList.mockResolvedValue(new UserProjectionsListDto([]));

      const entities: CreatorAwareEntity[] = [
        { createdById: 'user-1' },
        { createdById: undefined },
        {},
      ];

      await service.fetchRelevantUserProjections(entities);

      expect(idpProjectionsFacade.getUserProjectionList).toHaveBeenCalledWith(['user-1']);
    });

    it('should pass empty array when all createdById are null or undefined', async () => {
      const { service, idpProjectionsFacade } = createService();
      idpProjectionsFacade.getUserProjectionList.mockResolvedValue(new UserProjectionsListDto([]));

      const entities = [{ createdById: null as unknown as string }, { createdById: undefined }, {}];

      await service.fetchRelevantUserProjections(entities as CreatorAwareEntity[]);

      expect(idpProjectionsFacade.getUserProjectionList).toHaveBeenCalledWith([]);
    });

    it('should not filter out "0" string ID', async () => {
      const { service, idpProjectionsFacade } = createService();
      idpProjectionsFacade.getUserProjectionList.mockResolvedValue(new UserProjectionsListDto([]));

      const entities: CreatorAwareEntity[] = [{ createdById: '0' }];

      await service.fetchRelevantUserProjections(entities);

      expect(idpProjectionsFacade.getUserProjectionList).toHaveBeenCalledWith(['0']);
    });

    it('should handle empty entities array', async () => {
      const { service, idpProjectionsFacade } = createService();
      idpProjectionsFacade.getUserProjectionList.mockResolvedValue(new UserProjectionsListDto([]));

      await service.fetchRelevantUserProjections([]);

      expect(idpProjectionsFacade.getUserProjectionList).toHaveBeenCalledWith([]);
    });
  });

  describe('fetchAllRelevantUserProjections', () => {
    const createDataMart = (overrides: Partial<DataMart> = {}): DataMart => {
      const dm = new DataMart();
      dm.createdById = 'creator-1';
      dm.businessOwners = [];
      dm.technicalOwners = [];
      return Object.assign(dm, overrides);
    };

    it('should collect user IDs from createdById, businessOwners, and technicalOwners', async () => {
      const { service, idpProjectionsFacade } = createService();
      idpProjectionsFacade.getUserProjectionList.mockResolvedValue(new UserProjectionsListDto([]));

      const dm = createDataMart({
        createdById: 'creator-1',
        businessOwners: [{ dataMartId: 'dm-1', userId: 'biz-owner-1' } as DataMartBusinessOwner],
        technicalOwners: [
          { dataMartId: 'dm-1', userId: 'tech-owner-1' } as DataMartTechnicalOwner,
          { dataMartId: 'dm-1', userId: 'tech-owner-2' } as DataMartTechnicalOwner,
        ],
      });

      await service.fetchAllRelevantUserProjections([dm]);

      expect(idpProjectionsFacade.getUserProjectionList).toHaveBeenCalledWith(
        expect.arrayContaining(['creator-1', 'biz-owner-1', 'tech-owner-1', 'tech-owner-2'])
      );
    });

    it('should deduplicate user IDs across multiple data marts', async () => {
      const { service, idpProjectionsFacade } = createService();
      idpProjectionsFacade.getUserProjectionList.mockResolvedValue(new UserProjectionsListDto([]));

      const dm1 = createDataMart({
        createdById: 'user-1',
        technicalOwners: [{ dataMartId: 'dm-1', userId: 'user-1' } as DataMartTechnicalOwner],
      });
      const dm2 = createDataMart({
        createdById: 'user-1',
        businessOwners: [{ dataMartId: 'dm-2', userId: 'user-2' } as DataMartBusinessOwner],
      });

      await service.fetchAllRelevantUserProjections([dm1, dm2]);

      const calledWith = idpProjectionsFacade.getUserProjectionList.mock.calls[0][0] as string[];
      expect(calledWith).toHaveLength(2);
      expect(calledWith).toContain('user-1');
      expect(calledWith).toContain('user-2');
    });

    it('should handle data marts with empty owner arrays', async () => {
      const { service, idpProjectionsFacade } = createService();
      idpProjectionsFacade.getUserProjectionList.mockResolvedValue(new UserProjectionsListDto([]));

      const dm = createDataMart({
        createdById: 'user-1',
        businessOwners: [],
        technicalOwners: [],
      });

      await service.fetchAllRelevantUserProjections([dm]);

      expect(idpProjectionsFacade.getUserProjectionList).toHaveBeenCalledWith(['user-1']);
    });

    it('should handle data marts with null/undefined owner arrays', async () => {
      const { service, idpProjectionsFacade } = createService();
      idpProjectionsFacade.getUserProjectionList.mockResolvedValue(new UserProjectionsListDto([]));

      const dm = createDataMart({
        createdById: 'user-1',
        businessOwners: undefined as unknown as DataMartBusinessOwner[],
        technicalOwners: undefined as unknown as DataMartTechnicalOwner[],
      });

      await service.fetchAllRelevantUserProjections([dm]);

      expect(idpProjectionsFacade.getUserProjectionList).toHaveBeenCalledWith(['user-1']);
    });
  });
});
