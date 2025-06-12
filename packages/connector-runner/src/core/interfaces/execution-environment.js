/* eslint-disable no-unused-vars */
/**
 * Interface for execution environments
 * Supports different runtime environments like Node.js, Docker, etc.
 */
class ExecutionEnvironment {
  /**
   * Create an isolated environment for connector execution
   * @param {string} connectorId - Unique identifier for the connector
   * @param {string} runId - Unique identifier for the run
   * @param {Array} dependencies - List of dependencies to install
   * @returns {Promise<string>} Path to the created environment
   */
  async createEnvironment(connectorId, runId, dependencies) {
    throw new Error('createEnvironment method must be implemented');
  }

  /**
   * Execute a connector in the prepared environment
   * @param {string} environmentPath - Path to the environment
   * @param {Object} executionContext - Context for execution (env vars, etc.)
   * @param {string | Stream | StdioPipeNamed | undefined} stdio - Standard input/output/error stream
   * @returns {Promise<void>} Promise that resolves when execution completes
   */
  async executeConnector(environmentPath, executionContext, stdio) {
    throw new Error('executeConnector method must be implemented');
  }

  /**
   * Clean up the environment after execution
   * @param {string} connectorId - Unique identifier for the connector
   * @param {string} runId - Unique identifier for the run
   * @returns {Promise<void>} Promise that resolves when cleanup completes
   */
  async cleanup(connectorId, runId) {
    throw new Error('cleanup method must be implemented');
  }
}

module.exports = ExecutionEnvironment;
