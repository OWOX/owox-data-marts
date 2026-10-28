import { materialKey } from './credential-material-key';

const SA_KEY = JSON.stringify({
  type: 'service_account',
  project_id: 'p',
  private_key_id: 'k',
  private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
  client_email: 'sa@p.iam.gserviceaccount.com',
});

describe('materialKey', () => {
  it('keeps values that differ only by surrounding whitespace apart', () => {
    const metadata = { fields: { accessKeyId: 'AKIA1' } };
    const key = (secretAccessKey: string) =>
      materialKey('aws-access-key', { fields: { secretAccessKey } }, metadata);
    const sa = (projectId: string) =>
      materialKey(
        'google-service-account',
        { value: JSON.stringify({ ...JSON.parse(SA_KEY), project_id: projectId }) },
        null
      );

    expect(key(' secret ')).not.toBe(key('secret'));
    expect(sa(' p ')).not.toBe(sa('p'));
    for (const [padded, plain] of [
      [' token ', 'token'],
      [' 123 ', '123'],
    ]) {
      expect(materialKey('github', { value: padded }, null)).not.toBe(
        materialKey('github', { value: plain }, null)
      );
    }
  });

  it('treats a blank field as an absent one', () => {
    const metadata = { fields: { accessKeyId: 'AKIA1' } };

    expect(
      materialKey(
        'aws-access-key',
        { fields: { secretAccessKey: 's', sessionToken: ' ' } },
        metadata
      )
    ).toBe(materialKey('aws-access-key', { fields: { secretAccessKey: 's' } }, metadata));
  });

  it('compares a value that is not JSON as the string itself', () => {
    const key = (value: string) => materialKey('google-service-account', { value }, null);

    expect(key('plain-key')).toBe(key('plain-key'));
    expect(key('plain-key')).not.toBe(key('other-key'));
  });
});
