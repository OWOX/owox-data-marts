import { UserProjectionDto } from '../../idp/dto/domain/user-projection.dto';
import { UserProjectionsListDto } from '../../idp/dto/domain/user-projections-list.dto';
import { CreatorAwareEntity } from '../entities/creator-aware-entity.interface';
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
});
