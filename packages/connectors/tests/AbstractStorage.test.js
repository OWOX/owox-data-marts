import assert from 'node:assert';
import { describe, it } from 'node:test';
import { AbstractStorage } from '../src/Core/AbstractStorage.js';
import { AbstractContext } from '../src/Core/AbstractContext.js';

function createContext(storageConfig = {}, sourceConfig = {}) {
  return new AbstractContext({
    source: { name: 'TestSource', config: sourceConfig },
    storage: { name: 'TestStorage', config: storageConfig },
    runConfig: {},
    env: { datamartId: 'dm-1', runId: 'run-1' },
  });
}

class TestStorage extends AbstractStorage {
  static parameters = {
    Database: { type: 'string', default: 'mydb' },
  };
  async init() {
    this.initialized = true;
  }
  async saveData(data) {
    this.saved = data;
  }
  getColumnType() {
    return 'STRING';
  }
}

describe('AbstractStorage', () => {
  describe('constructor', () => {
    it('throws without context', () => {
      assert.throws(() => new TestStorage(null, ['id']), /context is required/);
    });

    it('stores context', () => {
      const ctx = createContext();
      const storage = new TestStorage(ctx, ['id']);
      assert.strictEqual(storage.context, ctx);
    });

    it('normalizes uniqueKeyColumns to array', () => {
      const ctx = createContext();
      const storage = new TestStorage(ctx, 'id');
      assert.deepStrictEqual(storage.uniqueKeyColumns, ['id']);
    });

    it('keeps array uniqueKeyColumns as-is', () => {
      const ctx = createContext();
      const storage = new TestStorage(ctx, ['id', 'date']);
      assert.deepStrictEqual(storage.uniqueKeyColumns, ['id', 'date']);
    });

    it('stores schema and description', () => {
      const ctx = createContext();
      const storage = new TestStorage(ctx, ['id'], { id: { type: 'STRING' } }, 'desc');
      assert.deepStrictEqual(storage.schema, { id: { type: 'STRING' } });
      assert.strictEqual(storage.description, 'desc');
    });
  });

  describe('static parameters registration', () => {
    it('registers static parameters with owner=storage', () => {
      const ctx = createContext();
      new TestStorage(ctx, ['id']);
      assert.strictEqual(ctx.storageConfig.Database.value, 'mydb');
    });

    it('does not register on sourceConfig', () => {
      const ctx = createContext();
      new TestStorage(ctx, ['id']);
      assert.strictEqual(ctx.sourceConfig.Database, undefined);
    });

    it('handles subclass without static parameters', () => {
      class NoParamsStorage extends AbstractStorage {
        async init() {}
        async saveData() {}
        getColumnType() {
          return 'STRING';
        }
      }
      const ctx = createContext();
      // Should not throw
      new NoParamsStorage(ctx, ['id']);
    });
  });

  describe('getUniqueKeyByRecordFields', () => {
    it('joins unique key column values', () => {
      const ctx = createContext();
      const storage = new TestStorage(ctx, ['id', 'date']);
      const key = storage.getUniqueKeyByRecordFields({ id: 'A', date: '2024-01-01', other: 'x' });
      assert.ok(key.includes('A'));
      assert.ok(key.includes('2024-01-01'));
    });
  });

  describe('isRecordExists', () => {
    it('returns false when no records cached', () => {
      const ctx = createContext();
      const storage = new TestStorage(ctx, ['id']);
      assert.strictEqual(storage.isRecordExists({ id: 'A' }), false);
    });

    it('returns true after record added to values cache', () => {
      const ctx = createContext();
      const storage = new TestStorage(ctx, ['id']);
      const key = storage.getUniqueKeyByRecordFields({ id: 'A' });
      storage.values[key] = { id: 'A' };
      assert.strictEqual(storage.isRecordExists({ id: 'A' }), true);
    });
  });

  describe('init/saveData abstract', () => {
    it('init is overridable', async () => {
      const ctx = createContext();
      const storage = new TestStorage(ctx, ['id']);
      await storage.init();
      assert.strictEqual(storage.initialized, true);
    });

    it('saveData is overridable', async () => {
      const ctx = createContext();
      const storage = new TestStorage(ctx, ['id']);
      await storage.saveData([{ id: 'A' }]);
      assert.deepStrictEqual(storage.saved, [{ id: 'A' }]);
    });
  });

  describe('_reportRowsWritten', () => {
    it('emits a rows_written ANALYTICS event tagged with the destination table', () => {
      const ctx = createContext({ DestinationTableName: { value: 'campaigns' } });
      const storage = new TestStorage(ctx, ['id']);
      const written = [];
      const original = process.stdout.write;
      process.stdout.write = data => {
        written.push(data);
        return true;
      };
      try {
        storage._reportRowsWritten(250);
      } finally {
        process.stdout.write = original;
      }
      assert.strictEqual(written.length, 1);
      const parsed = JSON.parse(written[0].trim());
      assert.strictEqual(parsed.type, 'ANALYTICS');
      assert.strictEqual(parsed.metric, 'rows_written');
      assert.strictEqual(parsed.value, 250);
      assert.deepStrictEqual(parsed.tags, { node: 'campaigns' });
    });

    it('does not emit for a non-positive count', () => {
      const ctx = createContext({ DestinationTableName: { value: 'campaigns' } });
      const storage = new TestStorage(ctx, ['id']);
      const written = [];
      const original = process.stdout.write;
      process.stdout.write = () => {
        written.push(1);
        return true;
      };
      try {
        storage._reportRowsWritten(0);
      } finally {
        process.stdout.write = original;
      }
      assert.strictEqual(written.length, 0);
    });
  });
});
