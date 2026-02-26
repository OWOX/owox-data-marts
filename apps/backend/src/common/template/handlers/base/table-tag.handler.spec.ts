import { TableTagHandler } from './table-tag.handler';
import { HelperOptions } from 'handlebars';

function makeOptions(hash: Record<string, unknown>): HelperOptions {
  return { hash } as HelperOptions;
}

describe('DataTableTagHandler', () => {
  let handler: TableTagHandler;

  beforeEach(() => {
    handler = new TableTagHandler();
  });

  describe('tag', () => {
    it('should be "table"', () => {
      expect(handler.tag).toBe('table');
    });
  });

  describe('tagMetaInfo', () => {
    it('should return meta with name "table" and source parameter', () => {
      const meta = handler.tagMetaInfo();
      expect(meta.name).toBe('table');
      expect(meta.parameters).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'source', type: 'string' })])
      );
    });
  });

  describe('buildPayload', () => {
    const headers = [{ name: 'a' }, { name: 'b' }];
    const rows = [
      ['1', '2'],
      ['3', '4'],
      ['5', '6'],
    ];

    it('should resolve source="main" by default', () => {
      const context = { tableSources: { main: { dataHeaders: headers, dataRows: rows } } };
      const payload = handler.buildPayload([], makeOptions({}), context);
      expect(payload.dataHeaders).toEqual(headers);
      expect(payload.dataRows).toEqual(rows);
    });

    it('should resolve a custom source key', () => {
      const customHeaders = [{ name: 'x' }];
      const customRows = [['val']];
      const context = {
        tableSources: {
          main: { dataHeaders: headers, dataRows: rows },
          custom: { dataHeaders: customHeaders, dataRows: customRows },
        },
      };
      const payload = handler.buildPayload([], makeOptions({ source: 'custom' }), context);
      expect(payload.dataHeaders).toEqual(customHeaders);
      expect(payload.dataRows).toEqual(customRows);
    });

    it('should throw when source is not configured', () => {
      const context = { tableSources: { main: { dataHeaders: headers, dataRows: rows } } };
      expect(() => handler.buildPayload([], makeOptions({ source: 'unknown' }), context)).toThrow(
        'source "unknown" is not configured'
      );
    });

    it('should throw when source is not a string', () => {
      const context = { tableSources: {} };
      expect(() => handler.buildPayload([], makeOptions({ source: 123 }), context)).toThrow(
        '"source" must be a string'
      );
    });

    it('should respect limit parameter', () => {
      const manyRows = Array.from({ length: 20 }, (_, i) => [String(i)]);
      const context = {
        tableSources: { main: { dataHeaders: [{ name: 'a' }], dataRows: manyRows } },
      };
      const payload = handler.buildPayload([], makeOptions({ limit: 3 }), context);
      expect(payload.dataRows).toHaveLength(3);
      expect(payload.dataRows[0]).toEqual(['0']);
    });

    it('should respect from="end"', () => {
      const context = { tableSources: { main: { dataHeaders: headers, dataRows: rows } } };
      const payload = handler.buildPayload([], makeOptions({ limit: 2, from: 'end' }), context);
      expect(payload.dataRows).toEqual([
        ['3', '4'],
        ['5', '6'],
      ]);
    });

    it('should filter columns', () => {
      const context = { tableSources: { main: { dataHeaders: headers, dataRows: rows } } };
      const payload = handler.buildPayload([], makeOptions({ columns: 'b' }), context);
      expect(payload.dataHeaders).toEqual([{ name: 'b' }]);
      expect(payload.dataRows).toEqual([['2'], ['4'], ['6']]);
    });
  });

  describe('handle', () => {
    it('should render a markdown table', () => {
      const result = handler.handle({
        dataHeaders: [{ name: 'Name' }, { name: 'Value' }],
        dataRows: [
          ['foo', '1'],
          ['bar', '2'],
        ],
      });
      expect(result.rendered).toContain('| Name | Value |');
      expect(result.rendered).toContain('| foo | 1 |');
      expect(result.rendered).toContain('| bar | 2 |');
    });

    it('should return empty string for empty rows', () => {
      const result = handler.handle({
        dataHeaders: [{ name: 'A' }],
        dataRows: [],
      });
      expect(result.rendered).toBe('');
    });

    it('should return empty string for empty headers', () => {
      const result = handler.handle({
        dataHeaders: [],
        dataRows: [['val']],
      });
      expect(result.rendered).toBe('');
    });

    it('should escape pipe characters in cell values', () => {
      const result = handler.handle({
        dataHeaders: [{ name: 'Col' }],
        dataRows: [['a|b']],
      });
      expect(result.rendered).toContain('a\\|b');
    });

    it('should use alias over name in headers', () => {
      const result = handler.handle({
        dataHeaders: [{ name: 'col1', alias: 'Column One' }],
        dataRows: [['val']],
      });
      expect(result.rendered).toContain('| Column One |');
      expect(result.rendered).not.toContain('| col1 |');
    });
  });
});
