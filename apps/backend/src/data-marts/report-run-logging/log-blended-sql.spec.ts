import { logBlendedSqlIfNeeded } from './log-blended-sql';

const makeLogger = () => ({
  log: jest.fn(),
  error: jest.fn(),
  asArrays: jest.fn().mockReturnValue({ logs: [], errors: [] }),
});

describe('logBlendedSqlIfNeeded', () => {
  it('does nothing when logger is undefined', () => {
    expect(() =>
      logBlendedSqlIfNeeded({ needsBlending: true, blendedSql: 'SELECT 1' }, undefined)
    ).not.toThrow();
  });

  it('does nothing when needsBlending is false', () => {
    const logger = makeLogger();
    logBlendedSqlIfNeeded({ needsBlending: false }, logger);
    expect(logger.log).not.toHaveBeenCalled();
  });

  it('does nothing when blendedSql is missing even though needsBlending is true', () => {
    const logger = makeLogger();
    logBlendedSqlIfNeeded({ needsBlending: true }, logger);
    expect(logger.log).not.toHaveBeenCalled();
  });

  it('logs blended SQL with structured payload when required', () => {
    const logger = makeLogger();
    const sql = 'WITH cte AS (SELECT 1) SELECT * FROM cte';
    logBlendedSqlIfNeeded({ needsBlending: true, blendedSql: sql }, logger);
    expect(logger.log).toHaveBeenCalledWith({
      type: 'joined-data-marts-sql',
      message: 'SQL over joined Data Marts used for report execution',
      sql,
    });
  });
});
