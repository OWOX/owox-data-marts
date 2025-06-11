/**
 * Domain object representing the execution context for a connector run
 */
class RunContext {
    /**
     * @param {string} datamartId - The ID of the datamart
     * @param {string} runId - The ID of the run
     * @param {Object} config - The run configuration
     * @param {string | Stream | StdioPipeNamed | undefined} stdio - The standard input/output/error stream
     */
    constructor(datamartId, runId, config, stdio = 'inherit') {
        this.datamartId = datamartId;
        this.runId = runId;
        this.config = config;
        this.stdio = stdio;
    }

    /**
     * Get environment variables for the execution context
     * @returns {Object} Environment variables object
     */
    getEnvironmentVariables() {
        return {
            ...process.env,
            OW_DATAMART_ID: this.datamartId,
            OW_RUN_ID: this.runId,
            OW_CONFIG: JSON.stringify(this.config.toObject()),
        };
    }

    /**
     * Get a unique identifier for this run context
     * @returns {string} Unique identifier
     */
    getUniqueId() {
        return `${this.datamartId}-${this.runId}`;
    }
}

module.exports = RunContext; 