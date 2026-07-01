import { listDataMarts } from './list.js';

describe('data-marts list', () => {
  it('works through the API client dataMarts resource', async () => {
    await expect(
      listDataMarts({
        dataMarts: {
          list: async () => [{ id: 'mart-1', title: 'First Data Mart' }],
        },
      })
    ).resolves.toEqual([{ id: 'mart-1', title: 'First Data Mart' }]);
  });
});
