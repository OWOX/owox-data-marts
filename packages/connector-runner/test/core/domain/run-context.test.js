const RunContext = require('../../../src/core/domain/run-context');
const { Config } = require('../../../src/application/dto/config');
const { RunConfig } = require('../../../src/application/dto/run-config');

describe('RunContext', () => {
  let runContext;
  const mockDatamartId = 'test-datamart';
  const mockRunId = 'test-run';
  const mockConfig = {
    datamartId: mockDatamartId,
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

  beforeEach(() => {
    const config = Config.fromObject(mockConfig);
    const runConfig = new RunConfig({ type: 'INCREMENTAL', data: [], state: {} });
    runContext = new RunContext(mockDatamartId, mockRunId, config, runConfig);
  });

  test('should create a valid RunContext instance', () => {
    expect(runContext).toBeDefined();
    expect(runContext.datamartId).toBe(mockDatamartId);
    expect(runContext.runId).toBe(mockRunId);
    expect(runContext.config).toBeDefined();
    expect(runContext.runConfig).toBeDefined();
  });

  test('should generate environment variables correctly', () => {
    const envVars = runContext.getEnvironmentVariables();

    expect(envVars.OW_DATAMART_ID).toBe(mockDatamartId);
    expect(envVars.OW_RUN_ID).toBe(mockRunId);
    expect(envVars.OW_CONFIG).toBeDefined();
    expect(envVars.OW_RUN_CONFIG).toBeDefined();

    const configObj = JSON.parse(envVars.OW_CONFIG);
    expect(configObj.datamartId).toBe(mockDatamartId);
    expect(configObj.name).toBe('Test Config');
    expect(configObj.source.name).toBe('TestSource');
    expect(configObj.storage.name).toBe('TestStorage');

    const runConfigObj = JSON.parse(envVars.OW_RUN_CONFIG);
    expect(runConfigObj.type).toBe('INCREMENTAL');
  });

  test('should generate a unique ID correctly', () => {
    const uniqueId = runContext.getUniqueId();
    expect(uniqueId).toBe(`${mockDatamartId}-${mockRunId}`);
  });

  test('should use default stdio if not provided', () => {
    expect(runContext.stdio).toBe('inherit');
  });

  test('should use custom stdio if provided', () => {
    const customStdio = 'pipe';
    const config = Config.fromObject(mockConfig);
    const runConfig = new RunConfig({ type: 'INCREMENTAL', data: [], state: {} });
    const customRunContext = new RunContext(
      mockDatamartId,
      mockRunId,
      config,
      runConfig,
      customStdio
    );
    expect(customRunContext.stdio).toBe(customStdio);
  });
});
