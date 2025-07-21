const { spawn } = require('child_process');
const mockFs = require('mock-fs');

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

// Mock the createRequire and @owox/connectors before importing the class
jest.mock('node:module', () => ({
  createRequire: jest.fn(() => ({
    resolve: jest.fn(moduleName => {
      if (moduleName === '@owox/connectors') {
        return '/mock/path/to/@owox/connectors';
      }
      return '/mock/path/to/module';
    }),
  })),
}));

const NpmDependencyManager = require('../../../src/infrastructure/dependencies/npm-dependency-manager');

describe('NpmDependencyManager', () => {
  let dependencyManager;
  const mockWorkDir = '/mock/work/dir';
  const mockConnectorId = 'test-connector';
  const mockDependencies = [
    {
      name: 'test-package',
      version: '1.0.0',
      global: ['testGlobal'],
      global_is: true,
    },
  ];

  beforeEach(() => {
    dependencyManager = new NpmDependencyManager();
    mockFs({
      [mockWorkDir]: {},
    });
  });

  afterEach(() => {
    mockFs.restore();
    jest.clearAllMocks();
  });

  test('should install dependencies successfully', async () => {
    const mockSpawn = {
      on: jest.fn().mockImplementation((event, callback) => {
        if (event === 'close') {
          callback(0);
        }
        return mockSpawn;
      }),
    };
    spawn.mockReturnValue(mockSpawn);

    await expect(dependencyManager.installDependencies(mockWorkDir)).resolves.not.toThrow();

    const isWindows = process.platform === 'win32';
    expect(spawn).toHaveBeenCalledWith('npm', ['install'], {
      cwd: mockWorkDir,
      stdio: 'inherit',
      env: process.env,
      shell: isWindows,
    });
  });

  test('should reject on npm install failure', async () => {
    const mockSpawn = {
      on: jest.fn().mockImplementation((event, callback) => {
        if (event === 'close') {
          callback(1);
        }
        return mockSpawn;
      }),
    };
    spawn.mockReturnValue(mockSpawn);

    await expect(dependencyManager.installDependencies(mockWorkDir)).rejects.toThrow(
      'npm install failed: 1'
    );
  });

  test('should generate package.json correctly', () => {
    const packageJson = dependencyManager.generatePackageJson(mockConnectorId, mockDependencies);

    expect(packageJson.name).toBe(`connector-${mockConnectorId}`);
    expect(packageJson.private).toBe(true);
    expect(packageJson.dependencies).toBeDefined();

    expect(packageJson.dependencies['@owox/connectors']).toBeDefined();
    expect(packageJson.dependencies['@kaciras/deasync']).toBeDefined();
    expect(packageJson.dependencies['sync-request']).toBeDefined();
    expect(packageJson.dependencies['adm-zip']).toBeDefined();

    expect(packageJson.dependencies['test-package']).toBe('1.0.0');
  });

  test('should get default dependencies', () => {
    const defaultDeps = dependencyManager.getDefaultDependencies();

    expect(defaultDeps).toHaveLength(4);
    expect(defaultDeps[0].name).toBe('@owox/connectors');
    expect(defaultDeps[1].name).toBe('@kaciras/deasync');
    expect(defaultDeps[2].name).toBe('sync-request');
    expect(defaultDeps[3].name).toBe('adm-zip');
  });
});
