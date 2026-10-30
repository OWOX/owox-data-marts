import { GoogleAuth, Impersonated } from 'google-auth-library';
import { OwoxStorageIdentity } from './owox-storage-identity.service';

jest.mock('google-auth-library', () => ({
  GoogleAuth: jest.fn().mockImplementation(() => ({ getClient: jest.fn().mockResolvedValue({}) })),
  Impersonated: jest.fn().mockImplementation(() => ({})),
  OAuth2Client: jest.fn(),
}));

describe('OwoxStorageIdentity', () => {
  beforeEach(() => jest.clearAllMocks());

  it('caches one impersonated client per email and one ADC source', async () => {
    const identity = new OwoxStorageIdentity();
    const [a1, a2] = await Promise.all([identity.impersonate('a@x'), identity.impersonate('a@x')]);
    const b = await identity.impersonate('b@x');
    expect(a1).toBe(a2);
    expect(b).not.toBe(a1);
    expect(Impersonated).toHaveBeenCalledTimes(3);
    expect(GoogleAuth).toHaveBeenCalledTimes(1);
    expect(Impersonated).toHaveBeenCalledWith(
      expect.objectContaining({ targetPrincipal: 'b@x', lifetime: 3600 })
    );
  });
});
