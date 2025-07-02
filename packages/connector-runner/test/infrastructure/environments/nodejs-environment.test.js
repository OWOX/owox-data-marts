const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const mockFs = require('mock-fs');
const NodeJsEnvironment = require('../../../src/infrastructure/environments/nodejs-environment');
const NpmDependencyManager = require('../../../src/infrastructure/dependencies/npm-dependency-manager');
const NodeJsTemplateRenderer = require('../../../src/infrastructure/templates/nodejs-template-renderer');

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

jest.mock('env-paths', () => {
  return jest.fn(() => ({
    temp: '/mock/temp/path',
  }));
});

jest.mock('../../../src/infrastructure/dependencies/npm-dependency-manager');
jest.mock('../../../src/infrastructure/templates/nodejs-template-renderer');

// Mock fs.rmSync to work with mock-fs
const _originalRmSync = fs.rmSync;
const mockRmSync = jest.fn();

describe('NodeJsEnvironment', () => {
  let nodeJsEnvironment;
  const mockConnectorId = 'test-connector';
  const mockRunId = 'test-run';
  const mockDependencies = [
    {
      name: 'test-package',
      version: '1.0.0',
      global: ['testGlobal'],
      global_is: true,
    },
  ];
  const mockWorkDir = path.join('/mock/temp/path', mockConnectorId, mockRunId);

  beforeEach(() => {
    jest.clearAllMocks();

    mockFs({
      [path.dirname(mockWorkDir)]: {},
    });

    // Set up fs.rmSync mock to work with mock-fs
    mockRmSync.mockImplementation((dirPath, _options) => {
      if (fs.existsSync(dirPath)) {
        // Use mock-fs compatible removal
        const rimraf = dir => {
          if (fs.lstatSync(dir).isDirectory()) {
            fs.readdirSync(dir).forEach(file => {
              const filePath = path.join(dir, file);
              if (fs.lstatSync(filePath).isDirectory()) {
                rimraf(filePath);
              } else {
                fs.unlinkSync(filePath);
              }
            });
            fs.rmdirSync(dir);
          } else {
            fs.unlinkSync(dir);
          }
        };
        rimraf(dirPath);
      }
    });
    fs.rmSync = mockRmSync;

    NpmDependencyManager.mockImplementation(() => ({
      installDependencies: jest.fn().mockResolvedValue(undefined),
      generatePackageJson: jest.fn().mockReturnValue({
        name: `connector-${mockConnectorId}`,
        private: true,
        dependencies: {},
      }),
      getDefaultDependencies: jest.fn().mockReturnValue([]),
    }));

    NodeJsTemplateRenderer.mockImplementation(() => ({
      render: jest.fn().mockReturnValue('// Mock template content'),
    }));

    nodeJsEnvironment = new NodeJsEnvironment();
  });

  afterEach(() => {
    mockFs.restore();
    fs.rmSync = _originalRmSync;
  });

  test('should create environment successfully', async () => {
    const workDir = await nodeJsEnvironment.createEnvironment(
      mockConnectorId,
      mockRunId,
      mockDependencies
    );

    expect(workDir).toBe(mockWorkDir);
    expect(fs.existsSync(workDir)).toBe(true);
    expect(fs.existsSync(path.join(workDir, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(workDir, 'main.js'))).toBe(true);

    const dependencyManager = nodeJsEnvironment.dependencyManager;
    expect(dependencyManager.generatePackageJson).toHaveBeenCalledWith(
      mockConnectorId,
      mockDependencies
    );
    expect(dependencyManager.installDependencies).toHaveBeenCalledWith(mockWorkDir);

    const templateRenderer = nodeJsEnvironment.templateRenderer;
    expect(templateRenderer.render).toHaveBeenCalled();
  });

  test('should execute connector successfully', async () => {
    const mockSpawn = {
      on: jest.fn().mockImplementation((event, callback) => {
        if (event === 'close') {
          callback(0);
        }
        return mockSpawn;
      }),
    };
    spawn.mockReturnValue(mockSpawn);

    const mockExecutionContext = {
      OW_DATAMART_ID: mockConnectorId,
      OW_RUN_ID: mockRunId,
    };

    await expect(
      nodeJsEnvironment.executeConnector(mockWorkDir, mockExecutionContext, 'inherit')
    ).resolves.not.toThrow();

    expect(spawn).toHaveBeenCalledWith('node', ['main.js'], {
      cwd: mockWorkDir,
      stdio: 'inherit',
      env: mockExecutionContext,
    });
  });

  test('should reject on connector execution failure', async () => {
    const mockSpawn = {
      on: jest.fn().mockImplementation((event, callback) => {
        if (event === 'close') {
          callback(1);
        }
        return mockSpawn;
      }),
    };
    spawn.mockReturnValue(mockSpawn);

    await expect(nodeJsEnvironment.executeConnector(mockWorkDir, {}, 'inherit')).rejects.toThrow(
      'Connector execution failed with exit code: 1'
    );
  });

  test('should clean up environment', async () => {
    const nodeModulesDir = path.join(mockWorkDir, 'node_modules');
    mockFs({
      [mockWorkDir]: {
        node_modules: {
          'test-package': {},
        },
      },
    });

    await nodeJsEnvironment.cleanup(mockConnectorId, mockRunId);

    expect(fs.existsSync(nodeModulesDir)).toBe(false);
  });
});
