const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');
const ExecutionEnvironment = require('../../core/interfaces/execution-environment');
const NpmDependencyManager = require('../dependencies/npm-dependency-manager');
const NodeJsTemplateRenderer = require('../templates/nodejs-template-renderer');

const WORK_DIR_PREFIX = '../../dist/data-marts/conectivity/runs';

/**
 * Node.js execution environment implementation
 * Creates isolated Node.js environments for connector execution
 */
class NodeJsEnvironment extends ExecutionEnvironment {
  constructor() {
    super();
    this.dependencyManager = new NpmDependencyManager();
    this.templateRenderer = new NodeJsTemplateRenderer();
  }

  /**
   * Create an isolated Node.js environment for connector execution
   * @param {string} connectorId - Unique identifier for the connector
   * @param {string} runId - Unique identifier for the run
   * @param {Array} dependencies - List of dependencies to install
   * @returns {Promise<string>} Path to the created environment
   */
  async createEnvironment(connectorId, runId, dependencies) {
    const workDir = path.join(WORK_DIR_PREFIX, connectorId, runId);

    fs.mkdirSync(workDir, { recursive: true });

    const packageJson = this.dependencyManager.generatePackageJson(connectorId, dependencies);
    fs.writeFileSync(path.join(workDir, 'package.json'), JSON.stringify(packageJson, null, 2));

    await this.dependencyManager.installDependencies(workDir);

    const allDependencies = [...this.dependencyManager.getDefaultDependencies(), ...dependencies];
    const templateContent = this.templateRenderer.render(allDependencies);
    fs.writeFileSync(path.join(workDir, 'main.js'), templateContent);

    return workDir;
  }

  /**
   * Execute a connector in the prepared environment
   * @param {string} environmentPath - Path to the environment
   * @param {Object} executionContext - Context for execution (env vars, etc.)
   * @param {string | Stream | StdioPipeNamed | undefined} stdio - Standard input/output/error stream
   * @returns {Promise<void>} Promise that resolves when execution completes
   */
  async executeConnector(environmentPath, executionContext, stdio) {
    return new Promise((resolve, reject) => {
      const node = spawn('node', ['main.js'], {
        cwd: environmentPath,
        stdio,
        env: executionContext,
      });

      node.on('close', code => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Connector execution failed with exit code: ${code}`));
        }
      });

      node.on('error', error => {
        reject(new Error(`Failed to start connector process: ${error.message}`));
      });
    });
  }

  /**
   * Clean up the environment after execution
   * @param {string} connectorId - Unique identifier for the connector
   * @param {string} runId - Unique identifier for the run
   * @returns {Promise<void>} Promise that resolves when cleanup completes
   */
  async cleanup(connectorId, runId) {
    const workDir = path.join(WORK_DIR_PREFIX, connectorId, runId);
    fs.rmSync(path.join(workDir, 'node_modules'), { recursive: true, force: true });
  }
}

module.exports = NodeJsEnvironment;
