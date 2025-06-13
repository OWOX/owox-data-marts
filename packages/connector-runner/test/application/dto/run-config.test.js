const {
  RunConfig,
  SourceConfig,
  StorageConfig,
} = require('../../../src/application/dto/run-config');

describe('RunConfig', () => {
  const validConfig = {
    datamartId: 'test-datamart',
    name: 'Test Config',
    source: {
      name: 'TestSource',
      config: { sourceParam: 'value' },
    },
    storage: {
      name: 'TestStorage',
      config: { storageParam: 'value' },
    },
  };

  test('should create a valid RunConfig instance', () => {
    const runConfig = RunConfig.fromObject(validConfig);

    expect(runConfig).toBeDefined();
    expect(runConfig.datamartId).toBe(validConfig.datamartId);
    expect(runConfig.name).toBe(validConfig.name);
    expect(runConfig.source).toBeInstanceOf(SourceConfig);
    expect(runConfig.storage).toBeInstanceOf(StorageConfig);
  });

  test('should validate required fields', () => {
    expect(() => RunConfig.fromObject(null)).toThrow('Run configuration is required');
    expect(() => RunConfig.fromObject({})).toThrow('Data mart ID is required');
    expect(() => RunConfig.fromObject({ datamartId: 'test' })).toThrow(
      'Run configuration name is required'
    );
    expect(() =>
      RunConfig.fromObject({
        datamartId: 'test',
        name: 'test',
      })
    ).toThrow('Source configuration is required');
    expect(() =>
      RunConfig.fromObject({
        datamartId: 'test',
        name: 'test',
        source: {},
      })
    ).toThrow('Storage configuration is required');
  });

  test('should convert to plain object', () => {
    const runConfig = RunConfig.fromObject(validConfig);
    const plainObject = runConfig.toObject();

    expect(plainObject).toEqual(validConfig);
  });

  test('should validate source configuration', () => {
    const invalidSourceConfig = {
      ...validConfig,
      source: null,
    };

    expect(() => RunConfig.fromObject(invalidSourceConfig)).toThrow(
      'Source configuration is required'
    );
  });

  test('should validate storage configuration', () => {
    const invalidStorageConfig = {
      ...validConfig,
      storage: null,
    };

    expect(() => RunConfig.fromObject(invalidStorageConfig)).toThrow(
      'Storage configuration is required'
    );
  });
});

describe('SourceConfig', () => {
  const validSourceConfig = {
    name: 'TestSource',
    config: { sourceParam: 'value' },
  };

  test('should create a valid SourceConfig instance', () => {
    const sourceConfig = new SourceConfig(validSourceConfig);

    expect(sourceConfig).toBeDefined();
    expect(sourceConfig.name).toBe(validSourceConfig.name);
    expect(sourceConfig.config).toEqual(validSourceConfig.config);
  });

  test('should validate required fields', () => {
    expect(() => new SourceConfig(null)).toThrow('Source configuration is required');
    expect(() => new SourceConfig({})).toThrow('Source name is required');
    expect(() => new SourceConfig({ name: 'test' })).toThrow('Source config object is required');
  });

  test('should convert to plain object', () => {
    const sourceConfig = new SourceConfig(validSourceConfig);
    const plainObject = sourceConfig.toObject();

    expect(plainObject).toEqual(validSourceConfig);
  });
});

describe('StorageConfig', () => {
  const validStorageConfig = {
    name: 'TestStorage',
    config: { storageParam: 'value' },
  };

  test('should create a valid StorageConfig instance', () => {
    const storageConfig = new StorageConfig(validStorageConfig);

    expect(storageConfig).toBeDefined();
    expect(storageConfig.name).toBe(validStorageConfig.name);
    expect(storageConfig.config).toEqual(validStorageConfig.config);
  });

  test('should validate required fields', () => {
    expect(() => new StorageConfig(null)).toThrow('Storage configuration is required');
    expect(() => new StorageConfig({})).toThrow('Storage name is required');
    expect(() => new StorageConfig({ name: 'test' })).toThrow('Storage config object is required');
  });

  test('should convert to plain object', () => {
    const storageConfig = new StorageConfig(validStorageConfig);
    const plainObject = storageConfig.toObject();

    expect(plainObject).toEqual(validStorageConfig);
  });
});
