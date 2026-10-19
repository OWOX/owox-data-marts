import type { LoggerService } from '@nestjs/common';
import { CustomDataSourceLogger } from './data-source-options.config';

describe('CustomDataSourceLogger', () => {
  const createSink = () => {
    const sink = { log: jest.fn(), error: jest.fn(), warn: jest.fn() };
    const output = () =>
      JSON.stringify([sink.log.mock.calls, sink.error.mock.calls, sink.warn.mock.calls]);
    return { sink, logger: sink as unknown as LoggerService, output };
  };

  it('never prints the parameters of a plugin_action_execution query', () => {
    const { sink, logger: sinkLogger, output } = createSink();
    const logger = new CustomDataSourceLogger(sinkLogger, 'all');
    const insert =
      'INSERT INTO `plugin_action_execution`(`id`, `input`, `tokenHash`) VALUES (?, ?, ?)';
    const parameters = ['execution-1', '{"secret":"action input"}', 'token-hash'];

    logger.logQueryError('ER_DATA_TOO_LONG', insert, parameters);
    logger.logQuery(insert, parameters);
    logger.logQuerySlow(100, 'UPDATE "plugin_action_execution" SET "result" = ?', parameters);

    expect(output()).not.toContain('action input');
    expect(output()).not.toContain('token-hash');
    expect(sink.error).toHaveBeenCalledWith(`[QUERY ERROR] ${insert}`, 'ER_DATA_TOO_LONG');
    expect(sink.log).toHaveBeenCalledWith(insert);
    expect(sink.warn).toHaveBeenCalledWith(
      '[SLOW QUERY] (100ms): UPDATE "plugin_action_execution" SET "result" = ?'
    );
  });

  it('prints the parameters of a query on another table', () => {
    const { sink, logger: sinkLogger } = createSink();
    const logger = new CustomDataSourceLogger(sinkLogger, ['error']);
    const insert = 'INSERT INTO `plugin_installation`(`id`) VALUES (?)';

    logger.logQueryError('ER_DUP_ENTRY', insert, ['installation-1']);

    expect(sink.error).toHaveBeenCalledWith(
      `[QUERY ERROR] ${insert} -- Parameters: ["installation-1"]`,
      'ER_DUP_ENTRY'
    );
  });

  it.each([
    'connector_definition_version',
    'connector_source_credentials',
    'connector_protected_values',
  ])('withholds SQL, parameters and driver diagnostics containing %s secrets', table => {
    const { logger: sinkLogger, output } = createSink();
    const logger = new CustomDataSourceLogger(sinkLogger, 'all');
    const query = `INSERT INTO \`${table}\` (\`payload\`) VALUES ('inline-secret')`;

    logger.logQuery(query, ['bound-secret']);
    logger.logQuerySlow(100, query, ['bound-secret']);
    logger.logQueryError(new Error('Invalid value: driver-secret'), query, ['bound-secret']);

    expect(output()).not.toContain('inline-secret');
    expect(output()).not.toContain('bound-secret');
    expect(output()).not.toContain('driver-secret');
    expect(output()).toContain('protected');
  });
});
