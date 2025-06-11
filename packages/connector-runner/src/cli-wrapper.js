const ConnectorRunnerCli = require('./cli/connector-runner-cli');

const cli = new ConnectorRunnerCli();
cli.run(process.argv);