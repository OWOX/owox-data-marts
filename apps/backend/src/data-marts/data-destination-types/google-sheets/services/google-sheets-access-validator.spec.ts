import { Logger } from '@nestjs/common';
import { DestinationCredentialUnavailableException } from '../../../exceptions/destination-credential-unavailable.exception';
import { GoogleSheetsAccessValidator } from './google-sheets-access-validator';

describe('GoogleSheetsAccessValidator', () => {
  afterEach(() => jest.restoreAllMocks());

  const config = { type: 'google-sheets-config' as const, spreadsheetId: 'ss-1', sheetId: 0 };

  it("hands a bound Credential's typed error to the caller, keeping its code", async () => {
    const unavailable = new DestinationCredentialUnavailableException('Reconnect it.', true);
    const validator = new GoogleSheetsAccessValidator({
      createFromDestination: jest.fn().mockRejectedValue(unavailable),
    } as never);

    await expect(validator.validate(config, {} as never)).rejects.toBe(unavailable);
  });

  it('still reports a Google refusal as a failed check', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const validator = new GoogleSheetsAccessValidator({
      createFromDestination: jest.fn().mockResolvedValue({
        getSpreadsheet: jest
          .fn()
          .mockRejectedValue(new Error('The caller does not have permission')),
      }),
    } as never);

    const result = await validator.validate(config, {} as never);

    expect(result.valid).toBe(false);
    expect(result.errorMessage).toContain("doesn't have access to this Google Sheet");
  });

  it('checks access without recording a use of the Credential', async () => {
    const createFromDestination = jest.fn().mockResolvedValue(undefined);
    const destination = { id: 'dest-1' };

    await new GoogleSheetsAccessValidator({ createFromDestination } as never).validate(
      config,
      destination as never
    );

    expect(createFromDestination).toHaveBeenCalledWith(destination, { markUsed: false });
  });
});
