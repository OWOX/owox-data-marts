import { listStorages } from './list.js';

describe('storages list', () => {
  it('works through the API client storages resource', async () => {
    await expect(
      listStorages({
        storages: {
          list: async () => [{ id: 'storage-1', title: 'Storage', type: 'GOOGLE_BIGQUERY' }],
        },
      })
    ).resolves.toEqual([{ id: 'storage-1', title: 'Storage', type: 'GOOGLE_BIGQUERY' }]);
  });
});
