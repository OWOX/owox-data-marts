import { BadRequestException } from '@nestjs/common';
import { ReconnectGoogleSheetService } from './reconnect-google-sheet.service';
import { ReconnectGoogleSheetCommand } from '../../dto/domain/google-sheets/reconnect-google-sheet.command';
import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';

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
  const reportAccessService = { checkMutateAccess: jest.fn().mockResolvedValue(undefined) };
  const adapterFactory = { createFromDestination: jest.fn().mockResolvedValue(adapter) };

  const service = new ReconnectGoogleSheetService(
    reportService as never,
    reportAccessService as never,
    adapterFactory as never
  );

  return { service, adapter, reportService, reportAccessService, report };
}

const command = (title?: string) =>
  new ReconnectGoogleSheetCommand('report-1', 'proj-1', 'user-1', [], title);

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

    const result = await service.run(command('Revenue'));

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

    const result = await service.run(command('Revenue'));

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

    const result = await service.run(command('Revenue'));

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

  it('falls back to the report title when the command carries none', async () => {
    const { service, adapter } = build({ sheets: [], reportTitle: 'Weekly revenue' });

    await service.run(command());

    expect(adapter.addSheet).toHaveBeenCalledWith(SPREADSHEET_ID, 'Weekly revenue');
  });

  it("swaps apostrophes and caps the name at Google's 100-char limit", async () => {
    // Straight apostrophes would corrupt the writer's unescaped `'${title}'!A1`
    // ranges; a name longer than 100 chars is rejected by Google outright.
    const { service, adapter } = build({ sheets: [], reportTitle: `Bob's ${'x'.repeat(120)}` });

    await service.run(command());

    const usedTitle = adapter.addSheet.mock.calls[0][1] as string;
    expect(usedTitle.startsWith('Bob’s ')).toBe(true);
    expect(usedTitle).not.toContain("'");
    expect(usedTitle).toHaveLength(100);
  });

  it('falls back to a default name when the report title is blank', async () => {
    const { service, adapter } = build({ sheets: [], reportTitle: '   ' });

    await service.run(command());

    expect(adapter.addSheet).toHaveBeenCalledWith(SPREADSHEET_ID, 'Report data');
  });

  it('checks mutate access before touching the spreadsheet', async () => {
    const { service, adapter, reportAccessService } = build({ sheets: [] });
    reportAccessService.checkMutateAccess.mockRejectedValueOnce(new Error('forbidden'));

    await expect(service.run(command('Revenue'))).rejects.toThrow('forbidden');
    expect(adapter.getSpreadsheet).not.toHaveBeenCalled();
    expect(adapter.addSheet).not.toHaveBeenCalled();
  });

  it('rejects a report that does not write to Google Sheets', async () => {
    const { service, report } = build({ sheets: [] });
    report.dataDestination.type = DataDestinationType.LOOKER_STUDIO;

    await expect(service.run(command('Revenue'))).rejects.toBeInstanceOf(BadRequestException);
  });
});
