import { BadRequestException } from '@nestjs/common';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';
import { AddGoogleSheetToSpreadsheetCommand } from '../../dto/domain/google-sheets/add-google-sheet-to-spreadsheet.command';
import { GoogleApiException } from '../../exceptions/google-oauth.exceptions';
import { AddGoogleSheetToSpreadsheetService } from './add-google-sheet-to-spreadsheet.service';

const SPREADSHEET_ID = 'spread-1';

function build(opts: {
  sheets?: { sheetId: number; title: string }[];
  destinationType?: DataDestinationType;
  adapter?: null;
}) {
  const adapter = {
    getSpreadsheet: jest.fn().mockResolvedValue({
      properties: { title: 'Test Spreadsheet' },
      sheets: (opts.sheets ?? []).map(s => ({ properties: s })),
    }),
    findSheetByTitle: jest
      .fn()
      .mockImplementation(
        (spreadsheet: { sheets: { properties: { title: string } }[] }, title: string) =>
          spreadsheet.sheets.find(s => s.properties.title === title)
      ),
    addSheet: jest.fn().mockResolvedValue(4242),
  };
  const destination = {
    id: 'dest-1',
    type: opts.destinationType ?? DataDestinationType.GOOGLE_SHEETS,
  };
  const dataDestinationService = {
    getByIdAndProjectId: jest.fn().mockResolvedValue(destination),
  };
  const adapterFactory = {
    createFromDestination: jest.fn().mockResolvedValue(opts.adapter === null ? undefined : adapter),
  };
  const service = new AddGoogleSheetToSpreadsheetService(
    dataDestinationService as never,
    adapterFactory as never
  );
  return { service, adapter, dataDestinationService, adapterFactory };
}

const command = (title = 'Paid channel ad spend') =>
  new AddGoogleSheetToSpreadsheetCommand('dest-1', 'proj-1', SPREADSHEET_ID, title);

describe('AddGoogleSheetToSpreadsheetService', () => {
  it('adds a sheet named after the report to the spreadsheet', async () => {
    const { service, adapter, dataDestinationService, adapterFactory } = build({
      sheets: [{ sheetId: 0, title: 'Paid channel profit and revenue' }],
    });

    const result = await service.run(command());

    expect(dataDestinationService.getByIdAndProjectId).toHaveBeenCalledWith('dest-1', 'proj-1');
    expect(adapterFactory.createFromDestination).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'dest-1' })
    );
    expect(adapter.getSpreadsheet).toHaveBeenCalledWith(SPREADSHEET_ID);
    expect(adapter.addSheet).toHaveBeenCalledWith(SPREADSHEET_ID, 'Paid channel ad spend');
    expect(result).toEqual({
      spreadsheetId: SPREADSHEET_ID,
      sheetId: 4242,
      sheetTitle: 'Paid channel ad spend',
    });
  });

  it('sanitizes the sheet title the way the reconnect flow does', async () => {
    const { service, adapter } = build({});

    const result = await service.run(command('   '));

    expect(adapter.addSheet).toHaveBeenCalledWith(SPREADSHEET_ID, 'Report data');
    expect(result.sheetTitle).toBe('Report data');
  });

  // A same-named tab may hold hand-maintained data, and the next run would
  // overwrite it — so it is never reused, unlike the reconnect repair.
  it('refuses a title that already exists instead of reusing the sheet', async () => {
    const { service, adapter } = build({
      sheets: [{ sheetId: 3, title: 'Paid channel ad spend' }],
    });

    await expect(service.run(command())).rejects.toThrow(
      new BusinessViolationException(
        `Spreadsheet ${SPREADSHEET_ID} already has a sheet named "Paid channel ad spend". ` +
          'Use a different report name, or omit spreadsheet_id to create a new file.'
      )
    );
    expect(adapter.addSheet).not.toHaveBeenCalled();
  });

  it('explains an inaccessible spreadsheet with the remedy', async () => {
    const { service, adapter } = build({});
    adapter.getSpreadsheet.mockRejectedValue(
      Object.assign(new Error('The caller does not have permission'), { code: 403 })
    );

    await expect(service.run(command())).rejects.toThrow(BusinessViolationException);
    await expect(service.run(command())).rejects.toThrow(
      /Can't open Google spreadsheet spread-1 .* omit spreadsheet_id to create a new file\. Details: The caller does not have permission/
    );
    expect(adapter.addSheet).not.toHaveBeenCalled();
  });

  // Viewer access reads the metadata fine; only the write fails — the remedy must still show up.
  it('explains a write refused with Viewer access, after a successful read', async () => {
    const { service, adapter } = build({});
    adapter.addSheet.mockRejectedValue(
      Object.assign(new Error('The caller does not have permission'), { code: 403 })
    );

    const failure = await service.run(command()).catch(error => error);

    expect(failure).toBeInstanceOf(BusinessViolationException);
    expect(failure.message).toMatch(
      /Can't add a sheet to Google spreadsheet spread-1: .*Editor access.*omit spreadsheet_id.*Details: The caller does not have permission/
    );
    expect(adapter.getSpreadsheet).toHaveBeenCalledTimes(1);
  });

  it('reports a transient fault during the write as unavailable', async () => {
    const { service, adapter } = build({});
    adapter.addSheet.mockRejectedValue(Object.assign(new Error('Backend Error'), { code: 503 }));

    await expect(service.run(command())).rejects.toThrow(GoogleApiException);
  });

  it('reports a transient Google fault as unavailable, not as an access problem', async () => {
    const { service, adapter } = build({});
    adapter.getSpreadsheet.mockRejectedValue(
      Object.assign(new Error('Backend Error'), { code: 503 })
    );

    await expect(service.run(command())).rejects.toThrow(GoogleApiException);
  });

  it('rejects a destination that is not Google Sheets', async () => {
    const { service, adapter } = build({ destinationType: DataDestinationType.SLACK });

    await expect(service.run(command())).rejects.toThrow(
      new BadRequestException('Destination is not a Google Sheets destination')
    );
    expect(adapter.getSpreadsheet).not.toHaveBeenCalled();
  });

  it('rejects a destination without any usable credentials', async () => {
    const { service } = build({ adapter: null });

    await expect(service.run(command())).rejects.toThrow(BadRequestException);
  });
});
