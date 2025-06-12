/* eslint-disable no-unused-vars */
/**
 * Interface for dependency management
 * Handles installation and management of runtime dependencies
 */
class DependencyManager {
  /**
   * Install dependencies in the specified directory
   * @param {string} workDir - Working directory for installation
   * @returns {Promise<void>} Promise that resolves when installation completes
   */
  async installDependencies(workDir) {
    throw new Error('installDependencies method must be implemented');
  }

  /**
   * Generate package.json content for the dependencies
   * @param {string} connectorId - Unique identifier for the connector
   * @param {Array} dependencies - List of dependencies
   * @returns {Object} Package.json content object
   */
  generatePackageJson(connectorId, dependencies) {
    throw new Error('generatePackageJson method must be implemented');
  }
}

module.exports = DependencyManager;
