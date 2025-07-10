/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * NodeJsConfig - Configuration handler for Node.js runtime environment
 * 
 * This class extends AbstractConfig to provide Node.js-specific implementation
 * for managing data connector configurations. It handles configuration parameters
 * for both data sources and storage destinations, and provides logging and status
 * tracking functionality optimized for Node.js environments.
 * 
 * Key features:
 * - Merges source and storage configurations
 * - Provides JSON-formatted console logging for structured output
 * - Tracks import status and dates
 * - Manages data connector execution lifecycle
 */
class NodeJsConfig extends AbstractConfig {
    
    /**
     * Constructor - Initialize NodeJS configuration
     * 
     * @param {Object} config - Configuration object containing source and storage configs
     * @param {Object} config.source - Source configuration object
     * @param {string} config.source.name - Name of the data source connector
     * @param {Object} config.source.config - Source-specific configuration parameters
     * @param {Object} config.storage - Storage configuration object  
     * @param {string} config.storage.name - Name of the storage destination
     * @param {Object} config.storage.config - Storage-specific configuration parameters
     */
    constructor(config) {
      super({
        ...config.source.config,
        ...config.storage.config,
      });
  
      this.sourceName = { value: config.source.name };
      this.storageName = { value: config.storage.name };
    }
  
    /**
     * Get the name of the configured data source
     * 
     * @returns {string} The name of the data source connector
     */
    getSourceName() {
      return this.sourceName.value;
    }
  
    /**
     * Get the name of the configured storage destination
     * 
     * @returns {string} The name of the storage destination
     */
    getStorageName() {
      return this.storageName.value;
    }
  
    /**
     * Determine if notifications should be sent based on status and filter setting
     * For NodeJS environment, always return false
     * @param {number} status - Status constant
     * @returns {boolean} - Always false for NodeJS
     */
    shouldSendNotifications(status) {
      return false;
    }

    /**
     * Get all properties for a given status (NodeJS specific)
     * @param {number} status - Status constant
     * @returns {Object} - Object with status properties for NodeJS
     */
    getStatusProperties(status) {
      switch (status) {
        case EXECUTION_STATUS.IMPORT_IN_PROGRESS:
          return {
            displayText: "Import in progress"
          };
          
        case EXECUTION_STATUS.CLEANUP_IN_PROGRESS:
          return {
            displayText: "CleanUp in progress"
          };
          
        case EXECUTION_STATUS.IMPORT_DONE:
        case EXECUTION_STATUS.CLEANUP_DONE:
          return {
            displayText: "Done"
          };
          
        case EXECUTION_STATUS.ERROR:
          return {
            displayText: "Error"
          };
          
        default:
          return {
            displayText: `Unknown status: ${status}`
          };
      }
    }

    /**
     * Convert status constant to display string for NodeJS logging
     * @param {number} status - Status constant
     * @returns {string} - Display string for the status
     */
    getStatusDisplayString(status) {
      return this.getStatusProperties(status).displayText;
    }
  
    /**
     * Update and log the current execution status
     * 
     * Outputs structured JSON log entry to console for external monitoring
     * and tracking of connector execution status.
     * 
     * @param {number} status - Status constant
     */
    updateCurrentStatus(status) {
      const at = new Date();
      console.log(
        JSON.stringify({
          type: 'updateCurrentStatus',
          at: at.toISOString().split('T')[0] + ' ' + at.toISOString().split('T')[1].split('.')[0],
          status: this.getStatusDisplayString(status),
        })
      );
    }
  
    /**
     * Update and log the current execution status
     * 
     * Outputs structured JSON log entry to console for external monitoring
     * and tracking of connector execution status.
     * 
     * @param {Object} params - Parameters object with status and other properties
     * @param {number} params.status - Status constant
     * @param {string} params.error - Error message for Error status
     */
    handleStatusUpdate({ status }) {
      this.updateCurrentStatus(status);
    }
  
    /**
     * Update and log the last import attempt date
     * 
     * Records when the data import was last attempted, regardless of success/failure.
     * Useful for tracking import frequency and debugging scheduling issues.
     */
    updateLastImportDate() {
      const at = new Date();
      console.log(
        JSON.stringify({
          type: 'updateLastImportDate',
          at: at.toISOString().split('T')[0] + ' ' + at.toISOString().split('T')[1].split('.')[0],
          date: at.toISOString().split('T')[0],
        })
      );
    }
  
    /**
     * Update and log the last requested date for data retrieval
     * 
     * Records the specific date that was requested from the data source.
     * This helps track which date ranges have been processed and prevents
     * duplicate data requests.
     * 
     * @param {string} date - The date that was requested (typically in YYYY-MM-DD format)
     */
    updateLastRequstedDate(date) {
      const at = new Date();
      console.log(
        JSON.stringify({
          type: 'updateLastRequstedDate',
          at: at.toISOString().split('T')[0] + ' ' + at.toISOString().split('T')[1].split('.')[0],
          date: date,
        })
      );
    }
  
    /**
     * Check if the connector is currently in progress
     * 
     * In this Node.js implementation, this always returns false as Node.js
     * processes are typically short-lived and don't maintain persistent state.
     * The status is logged for monitoring purposes.
     * 
     * @returns {boolean} Always returns false for Node.js environment
     */
    isInProgress() {
      const at = new Date();
      console.log(
        JSON.stringify({
          type: 'isInProgress',
          at: at.toISOString().split('T')[0] + ' ' + at.toISOString().split('T')[1].split('.')[0],
          status: 'in_progress',
        })
      );
      return false;
    }
  
    /**
     * Add a warning status to the current execution
     * 
     * Logs warning status for non-fatal issues that occurred during execution.
     * Warnings indicate problems that didn't stop execution but may require attention.
     */
    addWarningToCurrentStatus() {
      const at = new Date();
      console.log(
        JSON.stringify({
          type: 'addWarningToCurrentStatus',
          at: at.toISOString().split('T')[0] + ' ' + at.toISOString().split('T')[1].split('.')[0],
          status: 'warning',
        })
      );
    }
  
    /**
     * Log a custom message with timestamp
     * 
     * Provides structured logging for custom messages during connector execution.
     * All log entries use consistent JSON format for easy parsing by log aggregators.
     * 
     * @param {string} message - The message to log
     */
    logMessage(message) {
      const at = new Date();
      console.log(
        JSON.stringify({
          type: 'log',
          at: at.toISOString().split('T')[0] + ' ' + at.toISOString().split('T')[1].split('.')[0],
          message: message,
        })
      );
    }
  }