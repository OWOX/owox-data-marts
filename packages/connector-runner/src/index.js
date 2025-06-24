const ConnectorExecutionService = require('./application/services/connector-execution-service');
const { RunConfig, SourceConfig, StorageConfig } = require('./application/dto/run-config');
/**
 * ConnectorRunner - Main class for running data connectors
 *
 * This is a backward-compatible wrapper around the new service-based architecture.
 * For new code, consider using ConnectorExecutionService directly.
 */
class ConnectorRunner {
  constructor() {
    this.executionService = new ConnectorExecutionService();
  }

  /**
   * Runs a data connector
   * @param {string} datamartId - The ID of the datamart
   * @param {string} runId - The ID of the run
   * @param {RunConfig} config - The configuration object
   * @param {string | Stream | StdioPipeNamed | undefined} stdio - The standard input/output/error stream
   * @returns {Promise<void>} - A promise that resolves when the connector runs successfully
   */
  async run(datamartId, runId, config, stdio = 'inherit') {
    return this.executionService.execute(datamartId, runId, config, stdio);
  }
}

module.exports = { ConnectorRunner, RunConfig, SourceConfig, StorageConfig };
