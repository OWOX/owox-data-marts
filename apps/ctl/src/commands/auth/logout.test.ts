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

      await expect(performLogout({ store })).resolves.toEqual({ removed: true });

      await expect(store.read()).resolves.toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports when no stored credentials exist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'owox-ctl-logout-test-'));
    const store = new ConfigStore(join(dir, 'config.json'));

    try {
      await expect(performLogout({ store })).resolves.toEqual({ removed: false });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('uses OWOX_CTL_CONFIG_PATH for the default logout store', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'owox-ctl-logout-test-'));
    const previousConfigPath = process.env.OWOX_CTL_CONFIG_PATH;
    process.env.OWOX_CTL_CONFIG_PATH = join(dir, 'config.json');

    try {
      const store = new ConfigStore(process.env.OWOX_CTL_CONFIG_PATH);
      await store.save({
        apiOrigin: 'https://app.owox.com',
        apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
        apiKeySecret: 'stored-secret',
      });

      await expect(performLogout()).resolves.toEqual({ removed: true });
      await expect(store.read()).resolves.toBeNull();
    } finally {
      if (previousConfigPath === undefined) {
        delete process.env.OWOX_CTL_CONFIG_PATH;
      } else {
        process.env.OWOX_CTL_CONFIG_PATH = previousConfigPath;
      }
      await rm(dir, { recursive: true, force: true });
    }
  });
});
