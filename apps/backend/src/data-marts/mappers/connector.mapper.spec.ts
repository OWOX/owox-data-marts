import { ConnectorMapper } from './connector.mapper';

describe(ConnectorMapper.name, () => {
  describe('toFieldOptionsResponse', () => {
    it('passes an option link through and leaves it out when the option has none', () => {
      const mapper = new ConnectorMapper();
      const url = 'https://docs.google.com/spreadsheets/d/a/edit#gid=7';

      const response = mapper.toFieldOptionsResponse([
        { value: 'Targets', label: 'Targets', url },
        { value: 'Data', label: 'Data' },
      ]);

      expect(response).toEqual([
        { value: 'Targets', label: 'Targets', url },
        { value: 'Data', label: 'Data' },
      ]);
      expect(response[1]).not.toHaveProperty('url');
    });
  });
});
