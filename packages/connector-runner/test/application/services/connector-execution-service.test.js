// Mock @owox/connectors before any imports that might use it
jest.mock('@owox/connectors', () => ({
  Storages: {
    TestStorage: {
      manifest: {
        environment: {
          node: {
            enabled: true,
            dependencies: [
              {
                name: 'test-package',
                version: '1.0.0',
                global: ['testGlobal'],
                global_is: true,
              },
            ],
          },
        },
      },
    },
  },
}));

const { RunConfig } = require('../../../src/application/dto/run-config');

const ConnectorExecutionService = require('../../../src/application/services/connector-execution-service');
const NodeJsEnvironment = require('../../../src/infrastructure/environments/nodejs-environment');

jest.mock('../../../src/infrastructure/environments/nodejs-environment');

describe('ConnectorExecutionService', () => {
  let executionService;
  let mockEnvironment;
  const mockDatamartId = 'test-datamart';
  const mockRunId = 'test-run';
  const mockConfig = RunConfig.fromObject({
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
  });

  beforeEach(() => {
    mockEnvironment = {
      createEnvironment: jest.fn().mockResolvedValue('/mock/work/dir'),
      executeConnector: jest.fn().mockResolvedValue(undefined),
      cleanup: jest.fn().mockResolvedValue(undefined),
    };
    NodeJsEnvironment.mockImplementation(() => mockEnvironment);

    executionService = new ConnectorExecutionService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should execute connector successfully', async () => {
    await expect(
      executionService.execute(mockDatamartId, mockRunId, mockConfig)
    ).resolves.not.toThrow();

    expect(mockEnvironment.createEnvironment).toHaveBeenCalledWith(
      mockDatamartId,
      mockRunId,
      expect.any(Array)
    );

    expect(mockEnvironment.executeConnector).toHaveBeenCalledWith(
      '/mock/work/dir',
      expect.objectContaining({
        OW_DATAMART_ID: mockDatamartId,
        OW_RUN_ID: mockRunId,
      }),
      'inherit'
    );

    expect(mockEnvironment.cleanup).toHaveBeenCalledWith(mockDatamartId, mockRunId);
  });

  test('should validate parameters', async () => {
    await expect(executionService.execute(null, mockRunId, mockConfig)).rejects.toThrow(
      'Datamart ID is required'
    );

    await expect(executionService.execute(mockDatamartId, null, mockConfig)).rejects.toThrow(
      'Run ID is required'
    );

    await expect(executionService.execute(mockDatamartId, mockRunId, null)).rejects.toThrow(
      'Configuration is required'
    );
  });

  test('should validate storage environment', async () => {
    jest.resetModules();
    jest.mock('@owox/connectors', () => ({
      Storages: {
        InvalidStorage: {},
      },
    }));

    const invalidConfig = {
      ...mockConfig,
      storage: {
        name: 'InvalidStorage',
        config: {},
      },
    };

    await expect(
      executionService.execute(mockDatamartId, mockRunId, invalidConfig)
    ).rejects.toThrow('Storage InvalidStorage not found');

    jest.resetModules();
    jest.mock('@owox/connectors', () => ({
      Storages: {
        NoNodeStorage: {
          manifest: {
            environment: {},
          },
        },
      },
    }));

    const noNodeConfig = {
      ...mockConfig,
      storage: {
        name: 'NoNodeStorage',
        config: {},
      },
    };

    await expect(executionService.execute(mockDatamartId, mockRunId, noNodeConfig)).rejects.toThrow(
      'Storage NoNodeStorage not found'
    );
  });

  test('should handle execution errors', async () => {
    mockEnvironment.executeConnector.mockRejectedValue(new Error('Execution failed'));

    await expect(executionService.execute(mockDatamartId, mockRunId, mockConfig)).rejects.toThrow(
      'Execution failed'
    );

    expect(mockEnvironment.cleanup).toHaveBeenCalledWith(mockDatamartId, mockRunId);
  });
});
