import { In, IsNull, Repository } from 'typeorm';
import { DataDestinationCredentialService } from './data-destination-credential.service';
import { DataDestinationCredential } from '../entities/data-destination-credential.entity';
import { DestinationCredentialType } from '../enums/destination-credential-type.enum';

describe('DataDestinationCredentialService', () => {
  const createService = () => {
    const repository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      softDelete: jest.fn(),
    } as unknown as Repository<DataDestinationCredential>;

    return {
      service: new DataDestinationCredentialService(repository),
      repository,
    };
  };

  describe('getByIds', () => {
    it('returns an empty Map without hitting the database when ids is empty', async () => {
      const { service, repository } = createService();

      const result = await service.getByIds([], 'proj-1');

      expect(result).toEqual(new Map());
      expect(repository.find).not.toHaveBeenCalled();
    });

    it('batch-fetches credentials scoped to the given project and indexes them by id', async () => {
      const { service, repository } = createService();
      const entities = [
        {
          id: 'cred-1',
          projectId: 'proj-1',
          type: DestinationCredentialType.GOOGLE_OAUTH,
          identity: { email: 'alice@gmail.com' },
        },
        {
          id: 'cred-2',
          projectId: 'proj-1',
          type: DestinationCredentialType.GOOGLE_OAUTH,
          identity: { email: 'bob@gmail.com' },
        },
      ] as DataDestinationCredential[];
      (repository.find as jest.Mock).mockResolvedValue(entities);

      const result = await service.getByIds(['cred-1', 'cred-2'], 'proj-1');

      expect(result).toEqual(
        new Map([
          ['cred-1', entities[0]],
          ['cred-2', entities[1]],
        ])
      );
      expect(repository.find).toHaveBeenCalledWith({
        where: { id: In(['cred-1', 'cred-2']), projectId: 'proj-1', deletedAt: IsNull() },
      });
    });

    it('omits soft-deleted credentials because the query filters deletedAt IS NULL', async () => {
      const { service, repository } = createService();
      const activeCredential = {
        id: 'cred-1',
        projectId: 'proj-1',
        type: DestinationCredentialType.GOOGLE_OAUTH,
        deletedAt: null,
      } as DataDestinationCredential;
      (repository.find as jest.Mock).mockResolvedValue([activeCredential]);

      const result = await service.getByIds(['cred-1', 'cred-deleted'], 'proj-1');

      expect(result).toEqual(new Map([['cred-1', activeCredential]]));
      expect(repository.find).toHaveBeenCalledWith({
        where: { id: In(['cred-1', 'cred-deleted']), projectId: 'proj-1', deletedAt: IsNull() },
      });
    });

    it('rejects a batch larger than the configured cap without hitting the database', async () => {
      const { service, repository } = createService();
      const tooManyIds = Array.from({ length: 501 }, (_, i) => `cred-${i}`);

      await expect(service.getByIds(tooManyIds, 'proj-1')).rejects.toThrow(
        'Cannot fetch more than 500 credentials at once'
      );
      expect(repository.find).not.toHaveBeenCalled();
    });
  });
});
