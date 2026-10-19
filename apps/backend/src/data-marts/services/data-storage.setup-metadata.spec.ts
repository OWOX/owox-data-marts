import { DataStorageService } from './data-storage.service';
describe('DataStorageService setup metadata', () => {
  const repository = { find: jest.fn() };
  const service = new DataStorageService(repository as never);
  beforeEach(() => jest.resetAllMocks());
  it('scopes the stored query and selects no credential or config columns', async () => {
    repository.find.mockResolvedValue([]);
    await expect(service.listSetupMetadata('project')).resolves.toEqual([]);
    expect(repository.find).toHaveBeenCalledWith({
      where: { projectId: 'project' },
      select: ['id', 'title', 'type', 'projectId'],
      loadEagerRelations: false,
      order: { id: 'ASC' },
    });
  });
  it('propagates database failures', async () => {
    const error = new Error('database unavailable');
    repository.find.mockRejectedValue(error);
    await expect(service.listSetupMetadata('project')).rejects.toBe(error);
  });
});
