import { BadRequestException } from '@nestjs/common';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';
import { AddGoogleSheetToSpreadsheetCommand } from '../../dto/domain/google-sheets/add-google-sheet-to-spreadsheet.command';
import { GoogleApiException } from '../../exceptions/google-oauth.exceptions';
import { AddGoogleSheetToSpreadsheetService } from './add-google-sheet-to-spreadsheet.service';

const SPREADSHEET_ID = 'spread-1';
const REQUESTER = 'ann@owox.com';

function build(opts: {
  sheets?: { sheetId: number; title: string }[];
  destinationType?: DataDestinationType;
  client?: null;
  driveCapable?: boolean;
  permissions?: Array<{ type: string; emailAddress?: string; domain?: string }>;
  idpEmail?: string | null;
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
    listFilePermissions: jest
      .fn()
      .mockResolvedValue(opts.permissions ?? [{ type: 'user', emailAddress: REQUESTER }]),
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
    createWithDriveScope: jest
      .fn()
      .mockResolvedValue(
        opts.client === null ? undefined : { adapter, driveCapable: opts.driveCapable ?? true }
      ),
  };
  const idpProjectionsFacade = {
    getUserProjection: jest
      .fn()
      .mockResolvedValue(
        opts.idpEmail === null ? undefined : { email: opts.idpEmail ?? REQUESTER }
      ),
  };
  const service = new AddGoogleSheetToSpreadsheetService(
    dataDestinationService as never,
    adapterFactory as never,
    idpProjectionsFacade as never
  );
  return { service, adapter, dataDestinationService, adapterFactory, idpProjectionsFacade };
}

// `null` = the token carried no email (a default parameter would swallow `undefined`).
const command = (title = 'Paid channel ad spend', email: string | null = REQUESTER) =>
  new AddGoogleSheetToSpreadsheetCommand(
    'dest-1',
    'proj-1',
    SPREADSHEET_ID,
    title,
    'user-1',
    email ?? undefined
  );

describe('AddGoogleSheetToSpreadsheetService', () => {
  it('adds a sheet named after the report to a spreadsheet shared with the requester', async () => {
    const { service, adapter, dataDestinationService, adapterFactory } = build({
      sheets: [{ sheetId: 0, title: 'Paid channel profit and revenue' }],
    });

    const result = await service.run(command());

    expect(dataDestinationService.getByIdAndProjectId).toHaveBeenCalledWith('dest-1', 'proj-1');
    expect(adapterFactory.createWithDriveScope).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'dest-1' })
    );
    expect(adapter.getSpreadsheet).toHaveBeenCalledWith(SPREADSHEET_ID);
    expect(adapter.listFilePermissions).toHaveBeenCalledWith(SPREADSHEET_ID);
    expect(adapter.addSheet).toHaveBeenCalledWith(SPREADSHEET_ID, 'Paid channel ad spend');
    expect(result).toEqual({
      spreadsheetId: SPREADSHEET_ID,
      sheetId: 4242,
      sheetTitle: 'Paid channel ad spend',
      sharedWithRequester: true,
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

  describe('requester access (checked, never granted)', () => {
    // The id may come from another user's report; the destination account could
    // still add the tab, leaving the requester with a link they cannot open.
    it('refuses a spreadsheet confirmed not to be shared with the requester, before writing', async () => {
      const { service, adapter } = build({
        permissions: [{ type: 'user', emailAddress: 'owner@example.com' }],
      });

      await expect(service.run(command())).rejects.toThrow(
        /is not shared with you \(ann@owox.com\).*omit spreadsheet_id to create a new file/
      );
      expect(adapter.addSheet).not.toHaveBeenCalled();
    });

    it.each([
      ['a domain grant', [{ type: 'domain', domain: 'owox.com' }]],
      ['an anyone-with-the-link grant', [{ type: 'anyone' }]],
      ['a case-insensitive user match', [{ type: 'user', emailAddress: 'Ann@OWOX.com' }]],
    ])('confirms access through %s', async (_label, permissions) => {
      const { service } = build({ permissions });

      await expect(service.run(command())).resolves.toEqual(
        expect.objectContaining({ sharedWithRequester: true })
      );
    });

    it('does not claim denial when a group grant cannot be expanded', async () => {
      const { service, adapter } = build({
        permissions: [{ type: 'group', emailAddress: 'analysts@owox.com' }],
      });

      await expect(service.run(command())).resolves.toEqual(
        expect.objectContaining({ sharedWithRequester: false })
      );
      expect(adapter.addSheet).toHaveBeenCalled();
    });

    it('proceeds unconfirmed when the token has no Drive scope', async () => {
      const { service, adapter } = build({ driveCapable: false });

      await expect(service.run(command())).resolves.toEqual(
        expect.objectContaining({ sharedWithRequester: false })
      );
      expect(adapter.listFilePermissions).not.toHaveBeenCalled();
    });

    it('proceeds unconfirmed when the sharing lookup fails', async () => {
      const { service, adapter } = build({});
      adapter.listFilePermissions.mockRejectedValue(
        Object.assign(new Error('insufficient scope'), { code: 403 })
      );

      await expect(service.run(command())).resolves.toEqual(
        expect.objectContaining({ sharedWithRequester: false })
      );
    });

    it('resolves the requester email through the IDP when the token carries none', async () => {
      const { service, idpProjectionsFacade } = build({
        permissions: [{ type: 'user', emailAddress: 'owner@example.com' }],
      });

      await expect(service.run(command('Sheet', null))).rejects.toThrow(
        'is not shared with you (ann@owox.com)'
      );
      expect(idpProjectionsFacade.getUserProjection).toHaveBeenCalledWith('user-1');
    });

    it('proceeds unconfirmed when no requester email can be resolved', async () => {
      const { service, adapter } = build({ idpEmail: null });

      await expect(service.run(command('Sheet', null))).resolves.toEqual(
        expect.objectContaining({ sharedWithRequester: false })
      );
      expect(adapter.listFilePermissions).not.toHaveBeenCalled();
    });
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
    const { service } = build({ client: null });

    await expect(service.run(command())).rejects.toThrow(BadRequestException);
  });
});
