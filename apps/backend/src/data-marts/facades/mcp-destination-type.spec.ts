import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { MCP_DESTINATION_TYPES, toMcpDestinationType } from './mcp-destination-type';

describe('toMcpDestinationType', () => {
  it('maps every destination type to the MCP vocabulary', () => {
    const mapped = Object.values(DataDestinationType).map(type => toMcpDestinationType(type));

    expect(mapped).toEqual([
      'google_sheets',
      'looker_studio',
      'email',
      'slack',
      'teams',
      'google_chat',
    ]);
    expect([...MCP_DESTINATION_TYPES].sort()).toEqual([...mapped].sort());
  });

  it('fails loudly on a value outside the enum instead of leaking undefined', () => {
    expect(() => toMcpDestinationType('SOMETHING_NEW' as DataDestinationType)).toThrow(
      'Unsupported destination type for MCP: SOMETHING_NEW'
    );
  });
});
