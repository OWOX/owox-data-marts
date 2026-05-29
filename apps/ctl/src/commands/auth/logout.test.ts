import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ConfigStore } from '../../config-store.js';
import { performLogout } from './logout.js';

describe('auth logout', () => {
  it('removes stored credentials', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'owox-ctl-logout-test-'));
    const store = new ConfigStore(join(dir, 'config.json'));

    try {
      await store.save({
        apiOrigin: 'https://app.owox.com',
        apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
        apiKeySecret: 'stored-secret',
      });

      await performLogout({ store });

      await expect(store.read()).resolves.toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
