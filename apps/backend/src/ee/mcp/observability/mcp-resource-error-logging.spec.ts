import { BadRequestException, Logger } from '@nestjs/common';
import { destinationToolCall } from '../tools/destination/destination-tool-error';
import { storageToolCall } from '../tools/storage/storage-tool-error';

describe('Storage and Destination error diagnostics', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each(['storage', 'resources', 'destination'] as const)(
    'logs the original %s error type and frames without provider values',
    async resource => {
      const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const error = new TypeError('PRIVATE_TOKEN\n    at PRIVATE_PROVIDER_RESPONSE');
      error.stack = `TypeError: ${error.message}\n    at originalCall (/app/provider.ts:42:7)`;
      Object.assign(error, { cause: new Error('PRIVATE_CAUSE'), response: 'PRIVATE_RESPONSE' });
      const execute = async () => {
        throw error;
      };

      await expect(
        resource === 'destination'
          ? destinationToolCall(execute)
          : storageToolCall(execute, resource === 'resources' ? 'list_resources' : 'get')
      ).rejects.not.toThrow('PRIVATE_');

      const logged = JSON.stringify(log.mock.calls);
      expect(logged).toContain('TypeError');
      expect(logged).toContain('/app/provider.ts:42:7');
      expect(logged).not.toContain('PRIVATE_');
    }
  );

  it('does not log expected validation errors as unexpected failures', async () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await expect(
      destinationToolCall(async () => {
        throw new BadRequestException('Only Google Sheets destinations support a Drive folder.');
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(log).not.toHaveBeenCalled();
  });
});
