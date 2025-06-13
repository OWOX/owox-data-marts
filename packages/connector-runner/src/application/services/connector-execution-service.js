const { RunConfig } = require('../dto/run-config');
const RunContext = require('../../core/domain/run-context');
const NodeJsEnvironment = require('../../infrastructure/environments/nodejs-environment');
const { Storages } = require('@owox/connectors');

/**
 * Service responsible for orchestrating connector execution
 * Handles validation, environment provisioning, and execution coordination
 */
class ConnectorExecutionService {
  constructor(executionEnvironment = null) {
    this.executionEnvironment = executionEnvironment || new NodeJsEnvironment();
  }

  /**
   * Execute a data connector
   * @param {string} datamartId - The ID of the datamart
   * @param {string} runId - The ID of the run
   * @param {Object} config - The configuration object
   * @param {string | Stream | StdioPipeNamed | undefined} stdio - The standard input/output/error stream
   * @returns {Promise<void>} - A promise that resolves when the connector runs successfully
   */
  async execute(datamartId, runId, config, stdio = 'inherit') {
    this._validateParameters(datamartId, runId, config);

    const runConfig = RunConfig.fromObject(config);
    const runContext = new RunContext(datamartId, runId, runConfig, stdio);

    const storage = this._getStorage(runConfig.storage.name);
    const storageEnvironment = this._validateStorageEnvironment(storage, runConfig.storage.name);

    try {
      const environmentPath = await this.executionEnvironment.createEnvironment(
        datamartId,
        runId,
        storageEnvironment.node.dependencies
      );

      await this.executionEnvironment.executeConnector(
        environmentPath,
        runContext.getEnvironmentVariables(),
        stdio
      );
    } finally {
      await this.executionEnvironment.cleanup(datamartId, runId);
    }
  }

  _validateParameters(datamartId, runId, config) {
    if (!datamartId) throw new Error('Datamart ID is required');
    if (!runId) throw new Error('Run ID is required');
    if (!config) throw new Error('Configuration is required');
  }

  _getStorage(storageName) {
    const storage = Storages[storageName];
    if (!storage) {
      throw new Error(`Storage ${storageName} not found`);
    }
    return storage;
  }

  _validateStorageEnvironment(storage, storageName) {
    const storageManifest = storage.manifest;
    if (!storageManifest) {
      throw new Error(`Storage ${storageName} manifest not found`);
    }

    const storageNodeEnvironment = storageManifest.environment;
    if (!storageNodeEnvironment?.node?.enabled) {
      throw new Error(`Storage ${storageName} does not support node environment`);
    }

    return storageNodeEnvironment;
  }
}

module.exports = ConnectorExecutionService;
