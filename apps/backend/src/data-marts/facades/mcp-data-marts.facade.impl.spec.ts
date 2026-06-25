jest.mock('../use-cases/list-data-marts.service', () => ({
  ListDataMartsService: jest.fn(),
}));

import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataMartListItemDto } from '../dto/domain/data-mart-list-item.dto';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import type { ListDataMartsService } from '../use-cases/list-data-marts.service';
import { McpDataMartsFacadeImpl } from './mcp-data-marts.facade.impl';

describe('McpDataMartsFacadeImpl', () => {
  it('lists data marts using project-member context', async () => {
    const listDataMartsService = {
      run: jest.fn().mockResolvedValue({
        items: [
          new DataMartListItemDto(
            'dm_1',
            'Orders',
            DataMartStatus.PUBLISHED,
            DataStorageType.GOOGLE_BIGQUERY,
            'BigQuery',
            new Date('2026-06-01T10:00:00.000Z'),
            new Date('2026-06-10T10:00:00.000Z'),
            'Mock Description'
          ),
        ],
        total: 1,
        offset: 0,
      }),
    } as unknown as jest.Mocked<ListDataMartsService>;

    const facade = new McpDataMartsFacadeImpl(listDataMartsService);

    const result = await facade.listDataMarts({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
    });

    expect(listDataMartsService.run).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        userId: 'user-1',
        roles: ['viewer'],
      })
    );
    expect(result).toEqual({
      dataMarts: [
        {
          id: 'dm_1',
          title: 'Orders',
          description: 'Mock Description',
          status: DataMartStatus.PUBLISHED,
          updatedAt: '2026-06-10T10:00:00.000Z',
        },
      ],
    });
  });
});
