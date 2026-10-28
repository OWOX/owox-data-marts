import { AthenaAccessValidator } from './athena/services/athena-access.validator';
import { RedshiftApiAdapter } from './redshift/adapters/redshift-api.adapter';
import { RedshiftConnectionType } from './redshift/enums/redshift-connection-type.enum';
import type { RedshiftConfig } from './redshift/schemas/redshift-config.schema';
import { RedshiftAccessValidator } from './redshift/services/redshift-access.validator';
import type { DataStorageConfig } from './data-storage-config.type';
import type { DataStorageCredentials } from './data-storage-credentials.type';

const redshiftConfig = {
  connectionType: RedshiftConnectionType.SERVERLESS,
  region: 'us-east-1',
  database: 'dev',
  workgroupName: 'default',
};
const temporaryKey = {
  accessKeyId: 'ASIA-key-id',
  secretAccessKey: 'temporary-secret',
  sessionToken: 'session-token-1',
} as DataStorageCredentials;

describe('AWS session tokens', () => {
  it('reach the Redshift client', async () => {
    const adapter = new RedshiftApiAdapter(temporaryKey as never, redshiftConfig as RedshiftConfig);
    const client = (
      adapter as unknown as {
        redshiftDataClient: { config: { credentials: () => Promise<unknown> } };
      }
    ).redshiftDataClient;

    await expect(client.config.credentials()).resolves.toMatchObject({
      accessKeyId: 'ASIA-key-id',
      secretAccessKey: 'temporary-secret',
      sessionToken: 'session-token-1',
    });
  });

  it.each([
    ['Athena', { region: 'us-east-1', outputBucket: 's3://results' }],
    ['Redshift', redshiftConfig],
  ])('reach the adapter of the %s access check', async (name, config) => {
    const checkAccess = jest.fn().mockResolvedValue(undefined);
    const factory = { create: jest.fn().mockReturnValue({ checkAccess }) };
    const validator =
      name === 'Athena'
        ? new AthenaAccessValidator(factory as never)
        : new RedshiftAccessValidator(factory as never);

    const result = await validator.validate(config as DataStorageConfig, temporaryKey);

    expect(result.valid).toBe(true);
    expect(factory.create).toHaveBeenCalledWith(
      expect.objectContaining({ sessionToken: 'session-token-1' }),
      expect.anything()
    );
    expect(checkAccess).toHaveBeenCalled();
  });
});
