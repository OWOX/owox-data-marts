import { McpDataMartModelMapper, SETUP_PREVIEW_MAX_BYTES } from './mcp-data-mart-model.mapper';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';

const observation = () => ({
  revision: 3,
  schemaInputRevision: 2,
  schemaFreshness: 'current' as const,
  preview: {
    columns: [{ name: 'value', alias: 'Value', type: 'STRING', credentials: 'must-not-escape' }],
    rows: [['small'], ['x'.repeat(SETUP_PREVIEW_MAX_BYTES)], ['later']],
    rowCount: 3,
    limit: 10,
    truncated: false,
  },
  observedModifiedAt: '2026-10-19T09:00:00.000Z',
  observedStatus: DataMartStatus.DRAFT,
  observedDefinitionType: DataMartDefinitionType.CONNECTOR,
  schemaActualizedAt: null,
  currentness: 'not-guaranteed' as const,
});

describe('McpDataMartModelMapper', () => {
  const mapper = new McpDataMartModelMapper();
  it('caps the entire payload on row boundaries and reports both forms of truncation', () => {
    const result = mapper.toPreview('id', observation());
    expect(result.rows).toEqual([['small']]);
    expect(result).toMatchObject({
      rowCount: 1,
      truncated: true,
      payloadTruncated: true,
      revision: 3,
    });
    expect(Buffer.byteLength(JSON.stringify(result, null, 2))).toBeLessThanOrEqual(
      SETUP_PREVIEW_MAX_BYTES
    );
    expect(result.columns).toEqual([{ name: 'value', alias: 'Value', type: 'STRING' }]);
    expect(JSON.stringify(result)).not.toContain('must-not-escape');
  });
  it('preserves aliases, scalar values and warehouse row truncation', () => {
    const input = observation();
    input.preview.rows = [['normal']];
    input.preview.truncated = true;
    const result = mapper.toPreview('id', input);
    expect(result).toMatchObject({
      rows: [['normal']],
      truncated: true,
      payloadTruncated: false,
      schema: { freshness: 'current', inputRevision: 2 },
      reportRunCreated: false,
      owoxConsumptionRecorded: false,
    });
  });
  it('rejects schema headers that exceed the payload budget', () => {
    const input = observation();
    input.preview.columns[0].name = 'x'.repeat(SETUP_PREVIEW_MAX_BYTES);
    expect(() => mapper.toPreview('id', input)).toThrow('Preview headers exceed');
  });
});
