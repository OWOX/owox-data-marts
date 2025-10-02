const fs = require('fs');
const ConnectorExecutionService = require('../application/services/connector-execution-service');
const { Config } = require('../application/dto/config');
const { RunConfig } = require('../application/dto/run-config');

/**
 * CLI wrapper for the connector runner
 * Handles command line arguments and delegates to the execution service
 */
class ConnectorRunnerCli {
  constructor() {
    this.executionService = new ConnectorExecutionService();
  }

  /**
   * Run the CLI with the provided arguments
   * @param {Array<string>} args - Command line arguments
   */
  async run(args) {
    if (args.length < 3) {
      console.error('Please provide a path to the json config file');
      process.exit(1);
    }

    const configFilePath = args[2];

    try {
      const rawConfig = JSON.parse(fs.readFileSync(configFilePath, 'utf-8'));

      const datamartId = 'cli-runner';
      const runId = new Date().toISOString();
      rawConfig.datamartId = datamartId;
      rawConfig.runId = runId;

      const runConfig = new RunConfig({ type: 'INCREMENTAL', data: [], state: {} });
      await this.executionService.execute(datamartId, runId, new Config(rawConfig), runConfig);
    } catch (error) {
      console.error('Error running connector:', error.message);
      process.exit(1);
    }
  }
}

// If this file is being run directly (not imported)
if (require.main === module) {
  const cli = new ConnectorRunnerCli();
  cli.run(process.argv);
}

module.exports = ConnectorRunnerCli;
