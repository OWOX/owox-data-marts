import { athenaOutputLocation } from './athena-output-location.util';

describe('athenaOutputLocation', () => {
  it('puts the results under the prefix in a plain bucket', () => {
    expect(athenaOutputLocation('results', 'owox-data-marts/1-a')).toEqual({
      uri: 's3://results/owox-data-marts/1-a',
      bucket: 'results',
      keyPrefix: 'owox-data-marts/1-a',
    });
  });

  // The setting is named a bucket, but a folder in it is entered as the AWS console shows one.
  // Athena writes under the whole value; the bucket S3 operations need is its first segment.
  it('splits a bucket with a folder at the first slash, keeping the key Athena writes to', () => {
    expect(athenaOutputLocation('results/uploads/', 'owox-data-marts/1-a')).toEqual({
      uri: 's3://results/uploads//owox-data-marts/1-a',
      bucket: 'results',
      keyPrefix: 'uploads//owox-data-marts/1-a',
    });
    expect(athenaOutputLocation('results/team/athena', 'owox-data-marts/1-a')).toEqual({
      uri: 's3://results/team/athena/owox-data-marts/1-a',
      bucket: 'results',
      keyPrefix: 'team/athena/owox-data-marts/1-a',
    });
  });
});
