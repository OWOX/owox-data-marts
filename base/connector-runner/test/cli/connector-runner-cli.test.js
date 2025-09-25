const fs = require('fs');
const ConnectorRunnerCli = require('../../src/cli/connector-runner-cli');

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
}));

const mockExecute = jest.fn();
jest.mock('../../src/application/services/connector-execution-service', () => {
  return jest.fn().mockImplementation(() => ({
    execute: mockExecute,
  }));
});

const ConnectorExecutionService = require('../../src/application/services/connector-execution-service');

describe('ConnectorRunnerCli', () => {
  let cli;
  let mockExit;
  let mockConsoleError;
  const mockConfigPath = '/path/to/config.json';
  const mockConfig = {
    name: 'Test Config',
    source: {
      name: 'test-source',
      config: {},
    },
    storage: {
      name: 'test-storage',
      config: {},
    },
  };

  beforeEach(() => {
    fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));
    fs.existsSync.mockReturnValue(true);

    mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    mockExecute.mockClear();
    ConnectorExecutionService.mockClear();

    cli = new ConnectorRunnerCli();
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });

  test('should run connector successfully with config file', async () => {
    mockExecute.mockResolvedValueOnce();

    await cli.run(['node', 'script.js', mockConfigPath]);

    expect(mockExecute).toHaveBeenCalledWith(
      'cli-runner',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
      expect.objectContaining({
        datamartId: 'cli-runner',
        name: mockConfig.name,
        source: expect.objectContaining({
          name: mockConfig.source.name,
        }),
        storage: expect.objectContaining({
          name: mockConfig.storage.name,
        }),
      }),
      expect.objectContaining({
        type: 'INCREMENTAL',
        data: [],
        state: {},
      })
    );
    expect(mockExit).not.toHaveBeenCalled();
  });

  test('should log error and exit if no config file provided', async () => {
    await cli.run([]);

    expect(mockConsoleError).toHaveBeenCalledWith('Please provide a path to the json config file');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  test('should handle file read errors', async () => {
    fs.readFileSync.mockImplementationOnce(() => {
      throw new Error('File not found');
    });

    await cli.run(['node', 'script.js', mockConfigPath]);

    expect(mockConsoleError).toHaveBeenCalledWith('Error running connector:', 'File not found');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  test('should handle execution errors', async () => {
    mockExecute.mockRejectedValueOnce(new Error('Execution failed'));

    await cli.run(['node', 'script.js', mockConfigPath]);

    expect(mockConsoleError).toHaveBeenCalledWith('Error running connector:', 'Execution failed');
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
