import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { AbstractStorage } from '../../../src/Core/AbstractStorage.js';
import { LOG_LEVEL } from '../../../src/Constants/CommonConstants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storagePath = path.join(__dirname, '../../../src/Storages/Snowflake/SnowflakeStorage.js');

function loadWithFakeSdk() {
  const createdWith = [];
  const snowflake = {
    configure() {},
    createConnection(config) {
      createdWith.push(config);
      return { connect: callback => callback(null, {}) };
    },
  };
  const context = vm.createContext({ AbstractStorage, LOG_LEVEL, snowflake });
  vm.runInContext(fs.readFileSync(storagePath, 'utf8'), context, { filename: storagePath });
  return { SnowflakeStorage: context.SnowflakeStorage, createdWith };
}

describe('SnowflakeStorage.createConnection', () => {
  it('passes the key-pair passphrase as privateKeyPass and enables advisory CRL checks', async () => {
    const { SnowflakeStorage, createdWith } = loadWithFakeSdk();
    const parameters = {
      SnowflakeAccount: { value: 'acc' },
      SnowflakeUsername: { value: 'user' },
      SnowflakeAuthenticator: { value: 'SNOWFLAKE_JWT' },
      SnowflakePrivateKey: { value: 'key' },
      SnowflakePrivateKeyPassphrase: { value: 'secret' },
    };
    const storage = Object.create(SnowflakeStorage.prototype);
    storage.context = { getParameter: name => parameters[name], log() {} };

    await storage.createConnection();

    expect(createdWith).toHaveLength(1);
    expect(createdWith[0]).toMatchObject({
      authenticator: 'SNOWFLAKE_JWT',
      privateKey: 'key',
      privateKeyPass: 'secret',
      certRevocationCheckMode: 'ADVISORY',
    });
    expect(createdWith[0]).not.toHaveProperty('privateKeyPassphrase');
  });
});
