import { buildConnectorBuilderPath } from './data-mart-ui-path';

describe('buildConnectorBuilderPath', () => {
  it('builds the connector builder deep-link path with encoding', () => {
    expect(buildConnectorBuilderPath('proj 1', 'def 9')).toBe(
      '/ui/proj%201/connectors/builder/def%209'
    );
  });
});
