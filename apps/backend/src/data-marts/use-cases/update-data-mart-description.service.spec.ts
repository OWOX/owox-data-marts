import { ForbiddenException } from '@nestjs/common';
import { UpdateDataMartDescriptionService } from './update-data-mart-description.service';
import { UpdateDataMartDescriptionCommand } from '../dto/domain/update-data-mart-description.command';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';

describe('UpdateDataMartDescriptionService optional description', () => {
  const createService = (allowed = true) => {
    const entity: { id: string; description: string | null; storage: { type: DataStorageType } } = {
      id: 'mart',
      description: 'Existing notes',
      storage: { type: DataStorageType.LEGACY_GOOGLE_BIGQUERY },
    };
    const dataMarts = {
      getByIdAndProjectId: jest.fn().mockResolvedValue(entity),
      save: jest.fn().mockResolvedValue(entity),
    };
    const legacy = { updateDescription: jest.fn().mockResolvedValue(undefined) };
    const index = { scheduleReindex: jest.fn().mockResolvedValue(undefined) };
    const service = new UpdateDataMartDescriptionService(
      dataMarts as never,
      { toDomainDto: (value: typeof entity) => ({ description: value.description }) } as never,
      legacy as never,
      { canAccess: jest.fn().mockResolvedValue(allowed) } as never,
      index as never
    );
    return { service, entity, dataMarts, legacy, index };
  };

  it('returns existing notes without writes, legacy synchronization or reindexing when omitted', async () => {
    const { service, dataMarts, legacy, index } = createService();
    const result = await service.run(
      new UpdateDataMartDescriptionCommand('mart', 'project', undefined, 'user', ['editor'])
    );
    expect(result.description).toBe('Existing notes');
    expect(dataMarts.save).not.toHaveBeenCalled();
    expect(legacy.updateDescription).not.toHaveBeenCalled();
    expect(index.scheduleReindex).not.toHaveBeenCalled();
  });

  it('still checks edit permission when the description is omitted', async () => {
    const { service, dataMarts, legacy } = createService(false);
    await expect(
      service.run(
        new UpdateDataMartDescriptionCommand('mart', 'project', undefined, 'user', ['editor'])
      )
    ).rejects.toThrow(ForbiddenException);
    expect(dataMarts.save).not.toHaveBeenCalled();
    expect(legacy.updateDescription).not.toHaveBeenCalled();
  });

  it.each([null, 'Updated notes'])(
    'persists and synchronizes an explicit value %p',
    async description => {
      const { service, entity, dataMarts, legacy, index } = createService();
      const result = await service.run(
        new UpdateDataMartDescriptionCommand('mart', 'project', description, 'user', ['editor'])
      );
      expect(result.description).toBe(description);
      expect(dataMarts.save).toHaveBeenCalledWith(entity);
      expect(legacy.updateDescription).toHaveBeenCalledWith('mart', description);
      expect(index.scheduleReindex).toHaveBeenCalled();
    }
  );
});
