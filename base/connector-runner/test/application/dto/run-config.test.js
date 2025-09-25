const { RunConfig } = require('../../../src/application/dto/run-config');

describe('RunConfig', () => {
  let runConfig;
  const mockConfig = {
    type: 'INCREMENTAL',
    data: [
      { configField: 'date', value: '2024-01-01' },
      { configField: 'limit', value: 100 },
    ],
    state: { lastRun: '2024-01-01T00:00:00Z' },
  };

  beforeEach(() => {
    runConfig = new RunConfig(mockConfig);
  });

  describe('constructor', () => {
    test('should create a valid RunConfig instance', () => {
      expect(runConfig).toBeDefined();
      expect(runConfig).toBeInstanceOf(RunConfig);
    });

    test('should store config properties correctly', () => {
      expect(runConfig._config).toEqual(mockConfig);
      expect(runConfig._type).toBe(mockConfig.type);
      expect(runConfig._data).toEqual(mockConfig.data);
      expect(runConfig._state).toEqual(mockConfig.state);
    });

    test('should handle empty config', () => {
      const emptyConfig = {};
      const emptyRunConfig = new RunConfig(emptyConfig);

      expect(emptyRunConfig._config).toEqual(emptyConfig);
      expect(emptyRunConfig._type).toBeUndefined();
      expect(emptyRunConfig._data).toBeUndefined();
      expect(emptyRunConfig._state).toBeUndefined();
    });

    test('should handle config with partial properties', () => {
      const partialConfig = { type: 'MANUAL_BACKFILL' };
      const partialRunConfig = new RunConfig(partialConfig);

      expect(partialRunConfig._type).toBe('MANUAL_BACKFILL');
      expect(partialRunConfig._data).toBeUndefined();
      expect(partialRunConfig._state).toBeUndefined();
    });
  });

  describe('getters', () => {
    test('should return config property', () => {
      expect(runConfig.config).toEqual(mockConfig);
    });

    test('should return type property', () => {
      expect(runConfig.type).toBe('INCREMENTAL');
    });

    test('should return data property', () => {
      expect(runConfig.data).toEqual([
        { configField: 'date', value: '2024-01-01' },
        { configField: 'limit', value: 100 },
      ]);
    });

    test('should return state property', () => {
      expect(runConfig.state).toEqual({ lastRun: '2024-01-01T00:00:00Z' });
    });

    test('should return undefined for missing properties', () => {
      const minimalConfig = { type: 'INCREMENTAL' };
      const minimalRunConfig = new RunConfig(minimalConfig);

      expect(minimalRunConfig.data).toBeUndefined();
      expect(minimalRunConfig.state).toBeUndefined();
    });
  });

  describe('toObject', () => {
    test('should return correct object structure', () => {
      const result = runConfig.toObject();

      expect(result).toEqual({
        type: 'INCREMENTAL',
        data: [
          { configField: 'date', value: '2024-01-01' },
          { configField: 'limit', value: 100 },
        ],
        state: { lastRun: '2024-01-01T00:00:00Z' },
      });
    });

    test('should return object with undefined properties for missing data', () => {
      const minimalConfig = { type: 'MANUAL_BACKFILL' };
      const minimalRunConfig = new RunConfig(minimalConfig);

      const result = minimalRunConfig.toObject();

      expect(result).toEqual({
        type: 'MANUAL_BACKFILL',
        data: undefined,
        state: undefined,
      });
    });

    test('should return object with empty arrays and objects', () => {
      const emptyConfig = {
        type: 'INCREMENTAL',
        data: [],
        state: {},
      };
      const emptyRunConfig = new RunConfig(emptyConfig);

      const result = emptyRunConfig.toObject();

      expect(result).toEqual({
        type: 'INCREMENTAL',
        data: [],
        state: {},
      });
    });

    test('should handle complex data structures', () => {
      const complexConfig = {
        type: 'CUSTOM',
        data: [
          { configField: 'nested', value: { key: 'value', array: [1, 2, 3] } },
          { configField: 'boolean', value: true },
          { configField: 'null', value: null },
        ],
        state: {
          metadata: { version: '1.0.0' },
          timestamps: ['2024-01-01', '2024-01-02'],
        },
      };
      const complexRunConfig = new RunConfig(complexConfig);

      const result = complexRunConfig.toObject();

      expect(result).toEqual(complexConfig);
    });
  });

  describe('integration scenarios', () => {
    test('should work with different run types', () => {
      const runTypes = ['INCREMENTAL', 'MANUAL_BACKFILL', 'FULL_REFRESH', 'CUSTOM'];

      runTypes.forEach(runType => {
        const config = { type: runType, data: [], state: {} };
        const runConfig = new RunConfig(config);

        expect(runConfig.type).toBe(runType);
        expect(runConfig.toObject().type).toBe(runType);
      });
    });

    test('should handle data with various field types', () => {
      const config = {
        type: 'INCREMENTAL',
        data: [
          { configField: 'string', value: 'test' },
          { configField: 'number', value: 42 },
          { configField: 'boolean', value: false },
          { configField: 'array', value: [1, 2, 3] },
          { configField: 'object', value: { nested: true } },
          { configField: 'null', value: null },
        ],
        state: {},
      };
      const runConfig = new RunConfig(config);

      expect(runConfig.data).toEqual(config.data);
      expect(runConfig.toObject().data).toEqual(config.data);
    });

    test('should maintain reference to original config data', () => {
      const originalData = [{ configField: 'test', value: 'original' }];
      const config = { type: 'INCREMENTAL', data: originalData, state: {} };
      const runConfig = new RunConfig(config);

      // Modify the original data
      originalData[0].value = 'modified';

      // RunConfig should reflect the changes since it references the original data
      expect(runConfig.data[0].value).toBe('modified');
      expect(runConfig.toObject().data[0].value).toBe('modified');
    });
  });
});
