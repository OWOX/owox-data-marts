const { spawn } = require('child_process');
const DependencyManager = require('../../core/interfaces/dependency-manager');
const { createRequire } = require('node:module');
const { findPackageRoot } = require('../../utils/package-utils');

let cachedDependencies = null;

/**
 * NPM-based dependency manager implementation
 */
class NpmDependencyManager extends DependencyManager {
  /**
   * Default dependencies for the connector runner
   *
   * {
   *  name: '<package-name>',
   *  version: '<package-version>',
   *  global: ['<global-variable-names>'],
   *  global_is: true // if true, the package will be imported as a global variable
   *
   */
  #DEFAULT_DEPENDENCIES;

  /**
   * Initialize DEFAULT_DEPENDENCIES
   */
  constructor() {
    super();

    if (!cachedDependencies) {
      const connectorsPackageName = '@owox/connectors';
      const req = createRequire(__filename);
      const connectorsPath = req.resolve(connectorsPackageName);
      const connectorsRoot = findPackageRoot(connectorsPath, connectorsPackageName);

      cachedDependencies = [
        {
          name: connectorsPackageName,
          version: `file:${connectorsRoot}`,
          global: ['OWOX'],
          global_is: true,
        },
        {
          name: '@kaciras/deasync',
          version: '1.1.0',
          global: ['deasync'],
          global_is: true,
        },
        {
          name: 'sync-request',
          version: '6.1.0',
          global: ['request'],
          global_is: true,
        },
        {
          name: 'adm-zip',
          version: '0.5.16',
          global: ['AdmZip'],
          global_is: true,
        },
      ];
    }

    this.#DEFAULT_DEPENDENCIES = cachedDependencies;
  }

  /**
   * Install dependencies using npm in the specified directory
   * @param {string} workDir - Working directory for installation
   * @param {Array} dependencies - List of dependencies to install
   * @returns {Promise<void>} Promise that resolves when installation completes
   */
  async installDependencies(workDir) {
    const isWindows = process.platform === 'win32';

    return new Promise((resolve, reject) => {
      const npm = spawn('npm', ['install'], {
        cwd: workDir,
        stdio: 'inherit',
        env: process.env,
        shell: isWindows,
      });

      npm.on('close', code => {
        code === 0 ? resolve() : reject(new Error(`npm install failed: ${code}`));
      });
    });
  }

  /**
   * Generate package.json content for the dependencies
   * @param {string} connectorId - Unique identifier for the connector
   * @param {Array} dependencies - List of dependencies
   * @returns {Object} Package.json content object
   */
  generatePackageJson(connectorId, dependencies) {
    return {
      name: `connector-${connectorId}`,
      private: true,
      dependencies: [...this.#DEFAULT_DEPENDENCIES, ...dependencies].reduce((acc, curr) => {
        acc[curr.name] = curr.version;
        return acc;
      }, {}),
    };
  }

  /**
   * Get default dependencies that are always included
   * @returns {Array} Array of default dependencies
   */
  getDefaultDependencies() {
    return this.#DEFAULT_DEPENDENCIES;
  }
}

module.exports = NpmDependencyManager;
