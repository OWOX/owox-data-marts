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

  describe('getColumnFormats', () => {
    /**
     * Builds a `spreadsheets.get` response whose `sheets` array lists a
     * decoy tab FIRST and the target tab second. This reproduces the real
     * failure mode: `ranges` only scopes which grid data is included, it does
     * not reorder `sheets` so that the requested tab is `sheets[0]`. The
     * adapter must therefore select by `sheetId`, not by position.
     */
    const buildGetMock = (cells: Array<sheets_v4.Schema$CellFormat | undefined>) =>
      jest.fn().mockResolvedValue({
        data: {
          sheets: [
            // Decoy tab at index 0 with no grid data (would yield all-undefined).
            { properties: { sheetId: 999 }, data: [{ rowData: [{ values: [] }] }] },
            // Target tab at index 1 carrying the real formats.
            {
              properties: { sheetId: 7 },
              data: [
                {
                  rowData: [
                    {
                      values: cells.map(fmt => (fmt ? { userEnteredFormat: fmt } : {})),
                    },
                  ],
                },
              ],
            },
          ],
        },
      });

    const withGetMock = (adapter: GoogleSheetsApiAdapter, getMock: jest.Mock) => {
      (adapter as unknown as { service: { spreadsheets: { get: jest.Mock } } }).service = {
        spreadsheets: { get: getMock },
      };
    };

    it('selects the target tab by sheetId, not by array position', async () => {
      const adapter = buildAdapter();
      const currency: sheets_v4.Schema$CellFormat = {
        numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0.00' },
      };
      const getMock = buildGetMock([undefined, currency, undefined]);
      withGetMock(adapter, getMock);

      const formats = await adapter.getColumnFormats('spread-1', 7, 'Sheet1', 2, 2, 1, 3);

      // Despite the decoy tab being sheets[0], we read the sheetId=7 tab.
      expect(formats).toEqual([undefined, currency, undefined]);
      // Sanity: the request scoped the fields to include sheetId for selection
      // and the full userEnteredFormat (not just numberFormat).
      expect(getMock).toHaveBeenCalledWith(
        expect.objectContaining({
          spreadsheetId: 'spread-1',
          ranges: ["'Sheet1'!A2:C2"],
          includeGridData: true,
          fields: expect.stringContaining('properties(sheetId)'),
        })
      );
      const calledFields = getMock.mock.calls[0][0].fields as string;
      expect(calledFields).toContain('userEnteredFormat');
      expect(calledFields).not.toContain('numberFormat'); // whole-format mask, not numberFormat-only
    });

    it('captures the whole userEnteredFormat (background, text, alignment), not just numberFormat', async () => {
      const adapter = buildAdapter();
      const styled: sheets_v4.Schema$CellFormat = {
        backgroundColor: { red: 1, green: 0.9, blue: 0.6 },
        textFormat: { bold: true },
        horizontalAlignment: 'RIGHT',
      };
      const getMock = buildGetMock([styled, undefined]);
      withGetMock(adapter, getMock);

      const formats = await adapter.getColumnFormats('spread-1', 7, 'Sheet1', 2, 2, 1, 2);

      expect(formats).toEqual([styled, undefined]);
    });

    it('takes the first non-empty format per column when scanning a multi-row window', async () => {
      // Column 0: row 2 unformatted, row 3 carries DATE → DATE must win.
      // Column 1: never formatted across the window → undefined.
      const adapter = buildAdapter();
      const date: sheets_v4.Schema$CellFormat = {
        numberFormat: { type: 'DATE', pattern: 'dd.mm.yyyy' },
      };
      const getMock = jest.fn().mockResolvedValue({
        data: {
          sheets: [
            {
              properties: { sheetId: 7 },
              data: [
                {
                  rowData: [
                    { values: [{}, {}] }, // row 2: both unformatted
                    { values: [{ userEnteredFormat: date }, {}] }, // row 3
                  ],
                },
              ],
            },
          ],
        },
      });
      withGetMock(adapter, getMock);

      const formats = await adapter.getColumnFormats('spread-1', 7, 'Sheet1', 2, 3, 1, 2);

      expect(formats).toEqual([date, undefined]);
      expect(getMock).toHaveBeenCalledWith(expect.objectContaining({ ranges: ["'Sheet1'!A2:B3"] }));
    });

    it('treats an empty userEnteredFormat object as no format', async () => {
      const adapter = buildAdapter();
      // Cell carries an empty userEnteredFormat ({}) — must be ignored, not captured.
      const getMock = buildGetMock([{}, undefined]);
      withGetMock(adapter, getMock);

      const formats = await adapter.getColumnFormats('spread-1', 7, 'Sheet1', 2, 2, 1, 2);

      expect(formats).toEqual([undefined, undefined]);
    });

    it('returns all-undefined when the requested sheetId is absent from the response', async () => {
      const adapter = buildAdapter();
      // Response only carries the decoy tab (sheetId 999); target 7 is missing.
      const getMock = jest.fn().mockResolvedValue({
        data: { sheets: [{ properties: { sheetId: 999 }, data: [{ rowData: [{ values: [] }] }] }] },
      });
      withGetMock(adapter, getMock);

      const formats = await adapter.getColumnFormats('spread-1', 7, 'Sheet1', 2, 2, 1, 3);

      expect(formats).toEqual([undefined, undefined, undefined]);
    });

    it('returns an empty array without calling the API when the column span is empty', async () => {
      const adapter = buildAdapter();
      const getMock = jest.fn();
      withGetMock(adapter, getMock);

      // toCol < fromCol → width <= 0.
      const formats = await adapter.getColumnFormats('spread-1', 7, 'Sheet1', 2, 2, 3, 1);

      expect(formats).toEqual([]);
      expect(getMock).not.toHaveBeenCalled();
    });

    it('returns an empty array without calling the API when the row window is empty', async () => {
      const adapter = buildAdapter();
      const getMock = jest.fn();
      withGetMock(adapter, getMock);

      // rowTo < rowFrom → no rows to sample (e.g. sheet has only the header row).
      const formats = await adapter.getColumnFormats('spread-1', 7, 'Sheet1', 2, 1, 1, 3);

      expect(formats).toEqual([]);
      expect(getMock).not.toHaveBeenCalled();
    });
  });

  describe('buildSetColumnFormatRequest', () => {
    it('targets a single column over the row span as a repeatCell', () => {
      const adapter = buildAdapter();
      const format: sheets_v4.Schema$CellFormat = {
        numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0.00' },
      };
      const req = adapter.buildSetColumnFormatRequest(7, 2, 1, 4, format);

      expect(req.repeatCell?.range).toEqual({
        sheetId: 7,
        startRowIndex: 1,
        endRowIndex: 4,
        startColumnIndex: 2,
        endColumnIndex: 3,
      });
      expect(req.repeatCell?.cell?.userEnteredFormat).toBe(format);
    });

    it('excludes textFormat.link from the field mask so per-cell hyperlinks are not propagated', () => {
      const adapter = buildAdapter();
      const req = adapter.buildSetColumnFormatRequest(7, 0, 1, 3, { textFormat: { bold: true } });
      const fields = req.repeatCell?.fields ?? '';

      // The link must NOT be in the mask — otherwise the sampled row's URL is
      // stamped over every row (cell shows id-5 but its link points to id-1).
      expect(fields).not.toContain('textFormat.link');
      // But the rest of the formatting IS restored.
      expect(fields).toContain('userEnteredFormat.numberFormat');
      expect(fields).toContain('userEnteredFormat.backgroundColor');
      expect(fields).toContain('userEnteredFormat.textFormat.bold');
      // It is a scoped mask, not the coarse whole-format mask.
      expect(fields).not.toBe('userEnteredFormat');
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

  describe('driveApiDisabled', () => {
    /** The 403 Google returns when the Drive API is off in the caller's project. */
    const serviceDisabledError = () =>
      Object.assign(
        new Error('Google Drive API has not been used in project 42 before or it is disabled.'),
        {
          response: {
            status: 403,
            data: {
              error: {
                status: 'PERMISSION_DENIED',
                errors: [{ reason: 'accessNotConfigured' }],
                details: [
                  {
                    reason: 'SERVICE_DISABLED',
                    metadata: {
                      activationUrl:
                        'https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=42',
                    },
                  },
                ],
              },
            },
          },
        }
      );

    it('recognizes a disabled Drive API and returns the activation URL', () => {
      expect(GoogleSheetsApiAdapter.driveApiDisabled(serviceDisabledError())).toEqual({
        activationUrl:
          'https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=42',
      });
    });

    it('recognizes it from the message alone when the body carries no reason codes', () => {
      const error = new Error(
        'Google Drive API has not been used in project 42 before or it is disabled.'
      );
      expect(GoogleSheetsApiAdapter.driveApiDisabled(error)).toEqual({ activationUrl: undefined });
    });

    it('ignores a genuine permission error', () => {
      const error = Object.assign(new Error('The caller does not have permission'), {
        response: {
          status: 403,
          data: { error: { status: 'PERMISSION_DENIED', errors: [{ reason: 'forbidden' }] } },
        },
      });
      expect(GoogleSheetsApiAdapter.driveApiDisabled(error)).toBeUndefined();
    });

    it('ignores a missing-folder error', () => {
      const error = Object.assign(new Error('File not found: abc'), {
        response: { status: 404, data: { error: { errors: [{ reason: 'notFound' }] } } },
      });
      expect(GoogleSheetsApiAdapter.driveApiDisabled(error)).toBeUndefined();
    });
  });
});
