// A source's configuration and its storage's settings share one context, and getParameter reads
// the source's first. The destination is wired into the storage config -- the host sends
// DestinationTableNameOverride, the engine writes DestinationTableName per node -- so a key of
// the same name in a Data Mart's configuration sent the write to another table. On main the
// storage config was merged over the source config, so the wired destination always won.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AbstractConnector } from '../../src/Core/AbstractConnector.js';
import { AbstractContext } from '../../src/Core/AbstractContext.js';
import { AbstractSource } from '../../src/Core/AbstractSource.js';
import { AbstractStorage } from '../../src/Core/AbstractStorage.js';

function createRecordingStorageClass() {
  const instances = [];
  const StorageClass = class RecordingStorage extends AbstractStorage {
    constructor(...args) {
      super(...args);
      this.tableAtInit = null;
      instances.push(this);
    }
    async init() {
      this.tableAtInit = this.context.getParameter('DestinationTableName')?.value ?? null;
    }
    async saveData() {}
  };
  StorageClass.instances = instances;
  return StorageClass;
}

function suppressStdout() {
  const original = process.stdout.write;
  process.stdout.write = () => true;
  return () => {
    process.stdout.write = original;
  };
}

describe('regression: the destination comes from the storage config', () => {
  it('writes to the table the host wired, not one a configuration key names', async () => {
    const restore = suppressStdout();
    try {
      const context = new AbstractContext({
        source: {
          name: 'TestSource',
          config: {
            Fields: { value: 'orders id' },
            DestinationTableName: { value: 'other_table' },
            DestinationTableNameOverride: { value: 'orders other_table' },
          },
        },
        storage: {
          name: 'TestStorage',
          config: { DestinationTableNameOverride: { value: 'orders target_table' } },
        },
        env: { datamartId: 'dm-1', runId: 'run-1' },
      });
      const source = {
        context,
        fieldsSchema: {
          orders: {
            fields: {},
            uniqueKeys: ['id'],
            isTimeSeries: false,
            destinationName: 'orders',
          },
        },
        parseFields: () => ({ orders: ['id'] }),
        getAccounts: () => [null],
        getDateStrategy: () => 'day-by-day',
        getDestinationName: AbstractSource.prototype.getDestinationName,
        fetchData: async () => [{ id: 1 }],
        onAccountComplete: () => {},
        onAccountError: () => {},
        onImportComplete: () => {},
      };
      const StorageClass = createRecordingStorageClass();

      await new AbstractConnector(context, source, StorageClass).run();

      assert.equal(StorageClass.instances.length, 1);
      assert.equal(StorageClass.instances[0].tableAtInit, 'target_table');
    } finally {
      restore();
    }
  });
});
