import { REJECT_API_KEY_AUTH_METADATA } from '../../idp/decorators';
import { RequestAccessController } from './request-access.controller';

jest.mock('../../idp', () => ({
  ...jest.requireActual('../../idp/decorators'),
  ...jest.requireActual('../../idp/types'),
}));

describe('RequestAccessController', () => {
  it('rejects API-key authentication at the controller level', () => {
    expect(Reflect.getMetadata(REJECT_API_KEY_AUTH_METADATA, RequestAccessController)).toBe(true);
  });
});
