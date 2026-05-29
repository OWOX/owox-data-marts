import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';

import { jest } from '@jest/globals';
import { OWOXAuthError } from '@owox/api-client';

import { ConfigStore } from '../../config-store.js';
import { performLogin, promptSecret, resolveLoginInput } from './login.js';

describe('auth login', () => {
  async function createStore(): Promise<{ store: ConfigStore; cleanup: () => Promise<void> }> {
    const dir = await mkdtemp(join(tmpdir(), 'owox-ctl-login-test-'));
    return {
      store: new ConfigStore(join(dir, 'config.json')),
      cleanup: () => rm(dir, { recursive: true, force: true }),
    };
  }

  it('saves config after successful validation', async () => {
    const { store, cleanup } = await createStore();
    try {
      await performLogin(
        {
          apiOrigin: 'https://app.owox.com',
          apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
          apiKeySecret: 'valid-secret',
        },
        {
          store,
          createClient: config => ({
            authenticate: async () => {
              expect(config.apiKeySecret).toBe('valid-secret');
            },
          }),
        }
      );

      await expect(store.read()).resolves.toEqual({
        apiOrigin: 'https://app.owox.com',
        apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
        apiKeySecret: 'valid-secret',
      });
    } finally {
      await cleanup();
    }
  });

  it('does not save config after failed validation', async () => {
    const { store, cleanup } = await createStore();
    try {
      await expect(
        performLogin(
          {
            apiOrigin: 'https://app.owox.com',
            apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
            apiKeySecret: 'invalid-secret',
          },
          {
            store,
            createClient: () => ({
              authenticate: async () => {
                throw new OWOXAuthError('Unauthorized', { status: 401 });
              },
            }),
          }
        )
      ).rejects.toBeInstanceOf(OWOXAuthError);

      await expect(store.read()).resolves.toBeNull();
    } finally {
      await cleanup();
    }
  });

  it('uses environment values before prompting during login', async () => {
    const promptText = jest.fn<() => Promise<string>>();
    const promptSecret = jest.fn<() => Promise<string>>();

    await expect(
      resolveLoginInput(
        {},
        {
          OWOX_API_ORIGIN: 'https://env.example',
          OWOX_API_KEY_ID: 'pmk_env',
          OWOX_API_KEY_SECRET: 'env-secret',
        },
        { promptText, promptSecret }
      )
    ).resolves.toEqual({
      apiOrigin: 'https://env.example',
      apiKeyId: 'pmk_env',
      apiKeySecret: 'env-secret',
    });

    expect(promptText).not.toHaveBeenCalled();
    expect(promptSecret).not.toHaveBeenCalled();
  });

  it('uses explicit login flags before environment values', async () => {
    const promptText = jest.fn<() => Promise<string>>();
    const promptSecret = jest.fn<() => Promise<string>>();

    await expect(
      resolveLoginInput(
        {
          'api-origin': 'https://flag.example',
          'api-key-id': 'pmk_flag',
          'api-key-secret': 'flag-secret',
        },
        {
          OWOX_API_ORIGIN: 'https://env.example',
          OWOX_API_KEY_ID: 'pmk_env',
          OWOX_API_KEY_SECRET: 'env-secret',
        },
        { promptText, promptSecret }
      )
    ).resolves.toEqual({
      apiOrigin: 'https://flag.example',
      apiKeyId: 'pmk_flag',
      apiKeySecret: 'flag-secret',
    });

    expect(promptText).not.toHaveBeenCalled();
    expect(promptSecret).not.toHaveBeenCalled();
  });

  it('pauses stdin after reading a masked secret', async () => {
    const input = Object.assign(new EventEmitter(), {
      isTTY: true,
      pause: jest.fn(),
      resume: jest.fn(),
      setRawMode: jest.fn(),
    });
    const output = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });

    const secret = promptSecret(
      'API key secret: ',
      input as unknown as NodeJS.ReadStream,
      output as unknown as NodeJS.WriteStream
    );

    input.emit('data', Buffer.from('oks_secret'));
    input.emit('data', Buffer.from('\r'));

    await expect(secret).resolves.toBe('oks_secret');
    expect(input.resume).toHaveBeenCalled();
    expect(input.pause).toHaveBeenCalled();
    expect(input.setRawMode).toHaveBeenNthCalledWith(1, true);
    expect(input.setRawMode).toHaveBeenNthCalledWith(2, false);
  });
});
