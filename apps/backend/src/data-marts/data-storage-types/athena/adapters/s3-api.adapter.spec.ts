import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { S3ApiAdapter } from './s3-api.adapter';
import type { AthenaConfig } from '../schemas/athena-config.schema';
import type { AthenaCredentials } from '../schemas/athena-credentials.schema';

describe('S3ApiAdapter.cleanupOutputFiles', () => {
  let sent: unknown[];

  beforeEach(() => {
    sent = [];
    jest.spyOn(S3Client.prototype, 'send').mockImplementation(async (command: unknown) => {
      sent.push(command);
      if (command instanceof ListObjectsV2Command) {
        return { Contents: [{ Key: `${command.input.Prefix}/result.csv` }] };
      }
      return {};
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const adapter = (outputBucket: string) =>
    new S3ApiAdapter(
      { accessKeyId: 'AKIA', secretAccessKey: 'secret' } as AthenaCredentials,
      { region: 'us-east-1', outputBucket } as AthenaConfig
    );

  const inputs = () =>
    sent.map(command =>
      command instanceof ListObjectsV2Command || command instanceof DeleteObjectCommand
        ? { type: command.constructor.name, ...command.input }
        : command
    );

  it('deletes the results under the prefix in a plain bucket', async () => {
    await adapter('results').cleanupOutputFiles('results', 'owox-data-marts/1-a');

    expect(inputs()).toEqual([
      { type: 'ListObjectsV2Command', Bucket: 'results', Prefix: 'owox-data-marts/1-a' },
      { type: 'DeleteObjectCommand', Bucket: 'results', Key: 'owox-data-marts/1-a/result.csv' },
    ]);
  });

  // S3 refused the whole value as a bucket name, so the cleanup failed and every query's
  // results stayed in the customer's bucket.
  it('deletes them in a bucket configured with a folder, where Athena wrote them', async () => {
    await adapter('results/uploads/').cleanupOutputFiles('results/uploads/', 'owox-data-marts/1-a');

    expect(inputs()).toEqual([
      { type: 'ListObjectsV2Command', Bucket: 'results', Prefix: 'uploads//owox-data-marts/1-a' },
      {
        type: 'DeleteObjectCommand',
        Bucket: 'results',
        Key: 'uploads//owox-data-marts/1-a/result.csv',
      },
    ]);
  });
});
