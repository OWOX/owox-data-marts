import { BadRequestException } from '@nestjs/common';
import { ReconnectGoogleSheetService } from './reconnect-google-sheet.service';
import { ReconnectGoogleSheetCommand } from '../../dto/domain/google-sheets/reconnect-google-sheet.command';
import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';
import { GoogleSheetNotFound } from '../../errors/google-sheet-not-found.error';
import { GoogleApiException } from '../../exceptions/google-oauth.exceptions';

const SPREADSHEET_ID = 'spread-1';

/**
 * The service repairs `destinationConfig.sheetId` by TITLE. The two behaviours that
 * matter are "reuse a sheet that is already there" and "create one that is not" —
 * getting either wrong duplicates sheets (which Google rejects) or silently points
 * the report at the wrong place.
 */
function build(opts: { sheets: { sheetId: number; title: string }[]; reportTitle?: string }) {
  const adapter = {
    getSpreadsheet: jest.fn().mockResolvedValue({
      properties: { title: 'Test Spreadsheet' },
      sheets: opts.sheets.map(s => ({ properties: s })),
    }),
    findSheetByTitle: jest
      .fn()
      .mockImplementation(
        (spreadsheet: { sheets: { properties: { title: string } }[] }, title: string) =>
          spreadsheet.sheets.find(s => s.properties.title === title)
      ),
    findSheetById: jest
      .fn()
      .mockImplementation(
        (spreadsheet: { sheets: { properties: { sheetId: number } }[] }, sheetId: number) =>
          spreadsheet.sheets.find(s => s.properties.sheetId === sheetId)
      ),
    addSheet: jest.fn().mockResolvedValue(4242),
  };

  const report = {
    id: 'report-1',
    title: opts.reportTitle ?? 'Revenue',
    dataDestination: { id: 'dest-1', type: DataDestinationType.GOOGLE_SHEETS },
    destinationConfig: {
      type: 'google-sheets-config',
      spreadsheetId: SPREADSHEET_ID,
      sheetId: 7,
    },
  };

  const reportService = {
    getByIdAndProjectIdWithDestination: jest.fn().mockResolvedValue(report),
    updateDestinationConfig: jest.fn().mockResolvedValue(undefined),
  };
  const reportAccessService = {
    checkMutateAccessForReport: jest.fn().mockResolvedValue(undefined),
    checkOperateAccessForReport: jest.fn().mockResolvedValue(undefined),
  };
  const adapterFactory = { createFromDestination: jest.fn().mockResolvedValue(adapter) };

  const service = new ReconnectGoogleSheetService(
    reportService as never,
    reportAccessService as never,
    adapterFactory as never
  );

  return { service, adapter, reportService, reportAccessService, report };
}

const command = () => new ReconnectGoogleSheetCommand('report-1', 'proj-1', 'user-1', []);

describe('ReconnectGoogleSheetService', () => {
  it('leaves a report alone when its own sheet still exists', async () => {
    // The report's stored gid is 7. Rebinding by title here would move the report
    // onto the same-named sheet 12 — someone's hand-maintained tab — and the run
    // would overwrite it. Nothing is broken, so nothing is touched.
    const { service, adapter, reportService } = build({
      sheets: [
        { sheetId: 7, title: 'Some other name' },
        { sheetId: 12, title: 'Revenue' },
      ],
    });

    const result = await service.run(command());

    expect(result).toEqual({
      spreadsheetId: SPREADSHEET_ID,
      sheetId: 7,
      sheetTitle: 'Some other name',
      created: false,
      changed: false,
    });
    expect(adapter.addSheet).not.toHaveBeenCalled();
    expect(reportService.updateDestinationConfig).not.toHaveBeenCalled();
  });

  it('reuses an existing sheet with the same title instead of creating a second one', async () => {
    // gid 0 on purpose: the default first sheet, and the value a falsy check would
    // read as "nothing found" — then we would try to create a duplicate title.
    const { service, adapter, reportService } = build({
      sheets: [{ sheetId: 0, title: 'Revenue' }],
    });

    const result = await service.run(command());

    expect(adapter.addSheet).not.toHaveBeenCalled();
    expect(result).toEqual({
      spreadsheetId: SPREADSHEET_ID,
      sheetId: 0,
      sheetTitle: 'Revenue',
      created: false,
      changed: true,
    });
    expect(reportService.updateDestinationConfig).toHaveBeenCalledWith('report-1', {
      type: 'google-sheets-config',
      spreadsheetId: SPREADSHEET_ID,
      sheetId: 0,
    });
  });

  it('creates the sheet when the spreadsheet has no sheet with that title', async () => {
    const { service, adapter, reportService } = build({
      sheets: [{ sheetId: 12, title: 'Something else' }],
    });

    const result = await service.run(command());

    expect(adapter.addSheet).toHaveBeenCalledWith(SPREADSHEET_ID, 'Revenue');
    expect(result).toEqual({
      spreadsheetId: SPREADSHEET_ID,
      sheetId: 4242,
      sheetTitle: 'Revenue',
      created: true,
      changed: true,
    });
    expect(reportService.updateDestinationConfig).toHaveBeenCalledWith(
      'report-1',
      expect.objectContaining({ sheetId: 4242 })
    );
  });

  it('reuses a hand-made sheet whose name contains a straight apostrophe', async () => {
    // Regression for review: the old sanitizer swapped ' → ’ before the lookup,
    // so a hand-recreated tab literally named "Bob's data" was never matched and
    // a visually identical duplicate got created. Titles now stay as typed; A1
    // ranges escape apostrophes at construction instead.
    const { service, adapter, reportService } = build({
      sheets: [{ sheetId: 5, title: "Bob's data" }],
      reportTitle: "Bob's data",
    });

    const result = await service.run(command());

    expect(adapter.addSheet).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({ sheetId: 5, sheetTitle: "Bob's data", created: false })
    );
    expect(reportService.updateDestinationConfig).toHaveBeenCalledWith(
      'report-1',
      expect.objectContaining({ sheetId: 5 })
    );
  });

  it("caps the name at Google's 100-code-point limit without splitting surrogate pairs", async () => {
    // 99 chars + an emoji (2 UTF-16 units) straddling the boundary: a unit-based
    // slice would bisect the pair and produce a malformed title.
    const { service, adapter } = build({ sheets: [], reportTitle: `${'x'.repeat(99)}😀y` });

    await service.run(command());

    const usedTitle = adapter.addSheet.mock.calls[0][1] as string;
    expect(Array.from(usedTitle)).toHaveLength(100);
    expect(usedTitle.endsWith('😀')).toBe(true);
  });

  it('falls back to a default name when the report title is blank', async () => {
    const { service, adapter } = build({ sheets: [], reportTitle: '   ' });

    await service.run(command());

    expect(adapter.addSheet).toHaveBeenCalledWith(SPREADSHEET_ID, 'Report data');
  });

  it('checks mutate access before touching the spreadsheet', async () => {
    const { service, adapter, reportAccessService } = build({ sheets: [] });
    reportAccessService.checkMutateAccessForReport.mockRejectedValueOnce(new Error('forbidden'));

    await expect(service.run(command())).rejects.toThrow('forbidden');
    expect(adapter.getSpreadsheet).not.toHaveBeenCalled();
    expect(adapter.addSheet).not.toHaveBeenCalled();
  });

  it('requires operate access too — creating a sheet writes into the spreadsheet', async () => {
    const { service, adapter, reportAccessService } = build({ sheets: [] });
    reportAccessService.checkOperateAccessForReport.mockRejectedValueOnce(
      new Error('operate-forbidden')
    );

    await expect(service.run(command())).rejects.toThrow('operate-forbidden');
    expect(adapter.getSpreadsheet).not.toHaveBeenCalled();
    expect(adapter.addSheet).not.toHaveBeenCalled();
  });

  it('reports a transient Google fault as temporary, not as an access problem', async () => {
    const { service, adapter } = build({ sheets: [] });
    adapter.getSpreadsheet.mockRejectedValueOnce(
      Object.assign(new Error('Backend Error'), { code: 503 })
    );

    await expect(service.run(command())).rejects.toBeInstanceOf(GoogleApiException);
  });

  it('reports an unreachable spreadsheet with the access remedy', async () => {
    const { service, adapter } = build({ sheets: [] });
    adapter.getSpreadsheet.mockRejectedValueOnce(
      Object.assign(new Error('The caller does not have permission'), { code: 403 })
    );

    await expect(service.run(command())).rejects.toBeInstanceOf(GoogleSheetNotFound);
  });

  it('rejects a report that does not write to Google Sheets', async () => {
    const { service, report } = build({ sheets: [] });
    report.dataDestination.type = DataDestinationType.LOOKER_STUDIO;

    await expect(service.run(command())).rejects.toBeInstanceOf(BadRequestException);
  });
});
