import { mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  ConfigStore,
  getDefaultConfigPath,
  maskApiKeyId,
  resolveAuthConfig,
} from './config-store.js';

describe('config-store', () => {
  async function createStore(): Promise<{ store: ConfigStore; cleanup: () => Promise<void> }> {
    const dir = await mkdtemp(join(tmpdir(), 'owox-ctl-test-'));
    return {
      store: new ConfigStore(join(dir, 'config.json')),
      cleanup: () => rm(dir, { recursive: true, force: true }),
    };
  }

  it('env vars override stored config', async () => {
    const { store, cleanup } = await createStore();
    try {
      await store.save({
        apiOrigin: 'https://stored.example',
        apiKeyId: 'pmk_stored',
        apiKeySecret: 'stored-secret',
      });

      await expect(
        resolveAuthConfig({
          env: {
            OWOX_API_ORIGIN: 'https://env.example',
            OWOX_API_KEY_ID: 'pmk_env',
            OWOX_API_KEY_SECRET: 'env-secret',
          },
          store,
        })
      ).resolves.toEqual({
        source: 'env',
        config: {
          apiOrigin: 'https://env.example',
          apiKeyId: 'pmk_env',
          apiKeySecret: 'env-secret',
        },
      });
    } finally {
      await cleanup();
    }
  });

  it('uses the OWOX application config directory by default', () => {
    expect(getDefaultConfigPath({})).toEqual(
      expect.stringContaining(join('owox', 'ctl', 'config.json'))
    );
  });

  it('masks API key IDs without exposing the secret', () => {
    expect(maskApiKeyId('pmk_AbCdEfGhIjKlMnOpQrStUv')).toBe('pmk_AbCd...');
  });

  it('stores credentials in a current-user-only config file', async () => {
    const { store, cleanup } = await createStore();
    try {
      await store.save({
        apiOrigin: 'https://stored.example',
        apiKeyId: 'pmk_stored',
        apiKeySecret: 'stored-secret',
      });

      const fileMode = (await stat(store.path)).mode & 0o777;

      expect(fileMode).toBe(0o600);
    } finally {
      await cleanup();
    }
  });
});
