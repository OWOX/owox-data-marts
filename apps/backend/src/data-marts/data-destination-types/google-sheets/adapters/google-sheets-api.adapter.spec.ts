import { JWT } from 'google-auth-library';
import { sheets_v4 } from 'googleapis';
import { GoogleSheetsApiAdapter } from './google-sheets-api.adapter';

describe('GoogleSheetsApiAdapter (pure helpers)', () => {
  /**
   * The adapter constructor wraps `google.sheets()` but does not perform any
   * network I/O until a method is called. We pass a stub auth client so that
   * the constructor's preconditions are satisfied and we can exercise the
   * pure helpers (request builders, filter functions, A1 conversion).
   */
  const buildAdapter = () => new GoogleSheetsApiAdapter(undefined, {} as unknown as JWT);

  describe('colToA1', () => {
    it.each([
      [1, 'A'],
      [2, 'B'],
      [26, 'Z'],
      [27, 'AA'],
      [52, 'AZ'],
      [53, 'BA'],
      [702, 'ZZ'],
      [703, 'AAA'],
    ])('converts column %i to %s', (col, expected) => {
      expect(GoogleSheetsApiAdapter.colToA1(col)).toBe(expected);
    });

    it('rejects zero or negative column indexes', () => {
      expect(() => GoogleSheetsApiAdapter.colToA1(0)).toThrow();
      expect(() => GoogleSheetsApiAdapter.colToA1(-3)).toThrow();
    });
  });

  describe('buildInsertColumnRequest', () => {
    it('produces an insertDimension request for a single column with inheritFromBefore disabled', () => {
      // inheritFromBefore must stay false: the writer is the sole owner of
      // the new column's content and will populate header + data cells
      // immediately after the insert. Inheriting would clone user formulas
      // from the column to the left into row 2..N — see Bug 2 in DoD review.
      const adapter = buildAdapter();
      const req = adapter.buildInsertColumnRequest(7, 3);

      expect(req).toEqual({
        insertDimension: {
          range: {
            sheetId: 7,
            dimension: 'COLUMNS',
            startIndex: 3,
            endIndex: 4,
          },
          inheritFromBefore: false,
        },
      });
    });

    it('keeps inheritFromBefore false even at the first column position', () => {
      const adapter = buildAdapter();
      const req = adapter.buildInsertColumnRequest(7, 0);
      expect(req.insertDimension?.inheritFromBefore).toBe(false);
    });
  });

  describe('buildCopyPasteRequest', () => {
    it('builds a PASTE_FORMULA copy/paste request with both ranges expanded for fill-down', () => {
      // Fill-down replays a formula sitting in row 2 across rows 3..N for
      // every user column right of the imported range. Sheets shifts
      // relative refs the same way drag-fill does.
      const adapter = buildAdapter();
      const req = adapter.buildCopyPasteRequest(
        7,
        { startRow: 1, endRow: 2, startCol: 10, endCol: 12 }, // row 2, cols K..L
        { startRow: 2, endRow: 13, startCol: 10, endCol: 12 }, // rows 3..13, cols K..L
        'PASTE_FORMULA'
      );

      expect(req).toEqual({
        copyPaste: {
          source: {
            sheetId: 7,
            startRowIndex: 1,
            endRowIndex: 2,
            startColumnIndex: 10,
            endColumnIndex: 12,
          },
          destination: {
            sheetId: 7,
            startRowIndex: 2,
            endRowIndex: 13,
            startColumnIndex: 10,
            endColumnIndex: 12,
          },
          pasteType: 'PASTE_FORMULA',
          pasteOrientation: 'NORMAL',
        },
      });
    });

    it('respects the requested pasteType', () => {
      const adapter = buildAdapter();
      const req = adapter.buildCopyPasteRequest(
        1,
        { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
        { startRow: 1, endRow: 2, startCol: 0, endCol: 1 },
        'PASTE_VALUES'
      );
      expect(req.copyPaste?.pasteType).toBe('PASTE_VALUES');
    });
  });

  describe('buildDeleteColumnRequest', () => {
    it('produces a deleteDimension request for a single column', () => {
      const adapter = buildAdapter();
      const req = adapter.buildDeleteColumnRequest(7, 5);

      expect(req).toEqual({
        deleteDimension: {
          range: {
            sheetId: 7,
            dimension: 'COLUMNS',
            startIndex: 5,
            endIndex: 6,
          },
        },
      });
    });
  });

  describe('clearValuesInRange', () => {
    /**
     * Thin wrapper over `spreadsheets.values.clear`. We override the private
     * `service` so the test does not need network or googleapis mocking
     * machinery — we only care that the method passes through the exact
     * `spreadsheetId` and `range` it was given.
     */
    it('delegates to spreadsheets.values.clear with the provided range', async () => {
      const adapter = buildAdapter();
      const clearMock = jest.fn().mockResolvedValue({ data: {} });
      (
        adapter as unknown as { service: { spreadsheets: { values: { clear: jest.Mock } } } }
      ).service = {
        spreadsheets: { values: { clear: clearMock } },
      };

      await adapter.clearValuesInRange('spread-1', "'Sheet1'!A2:C10");

      expect(clearMock).toHaveBeenCalledTimes(1);
      expect(clearMock).toHaveBeenCalledWith({
        spreadsheetId: 'spread-1',
        range: "'Sheet1'!A2:C10",
      });
    });
  });

  describe('findOwoxColumnsMetadataForSheet', () => {
    /**
     * Build a typed metadata fixture quickly. The adapter's filter only
     * inspects `metadataKey` and `location.sheetId`, so other fields are
     * irrelevant to these tests.
     */
    const meta = (
      key: string,
      sheetId: number | undefined
    ): sheets_v4.Schema$DeveloperMetadata => ({
      metadataKey: key,
      metadataValue: '[]',
      location: sheetId === undefined ? {} : { sheetId },
    });

    it('returns only OWOX_COLUMNS entries bound to the given sheet', () => {
      const adapter = buildAdapter();
      const all: sheets_v4.Schema$DeveloperMetadata[] = [
        meta('OWOX_REPORT_META', 1),
        meta('OWOX_COLUMNS', 1),
        meta('OWOX_COLUMNS', 2),
        meta('OWOX_COLUMNS', undefined),
        meta('SOMETHING_ELSE', 1),
      ];

      const result = adapter.findOwoxColumnsMetadataForSheet(all, 1);

      expect(result).toEqual([meta('OWOX_COLUMNS', 1)]);
    });

    it('returns an empty array when no entries match', () => {
      const adapter = buildAdapter();
      expect(adapter.findOwoxColumnsMetadataForSheet([], 1)).toEqual([]);
    });
  });
});
