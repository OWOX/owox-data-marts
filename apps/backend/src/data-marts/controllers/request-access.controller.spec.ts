import { REJECT_API_KEY_AUTH_METADATA } from '../../idp/decorators';
import { RequestAccessController } from './request-access.controller';

jest.mock('../../idp', () => ({
  ...jest.requireActual('../../idp/decorators'),
  ...jest.requireActual('../../idp/types'),
}));

describe('RequestAccessController', () => {
  it.each(['getContext', 'requestAccess', 'createNewProject'] as const)(
    'rejects API-key authentication for %s',
    methodName => {
      expect(
        Reflect.getMetadata(
          REJECT_API_KEY_AUTH_METADATA,
          RequestAccessController.prototype[methodName]
        )
      ).toBe(true);
    }
  );
});
