import { listDestinations } from './list.js';

describe('destinations list', () => {
  it('works through the API client destinations resource', async () => {
    await expect(
      listDestinations({
        destinations: {
          list: async () => [{ id: 'destination-1', title: 'Destination', type: 'GOOGLE_SHEETS' }],
        },
      })
    ).resolves.toEqual([{ id: 'destination-1', title: 'Destination', type: 'GOOGLE_SHEETS' }]);
  });
});
