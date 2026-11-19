import { describe, it, expect } from 'vitest';
import { DataStorageType } from '../model/types/data-storage-type.enum';
import { getStorageUrl, s3ConsoleLink } from './storage-url.utils';

describe('s3ConsoleLink', () => {
  it('opens a plain bucket', () => {
    expect(s3ConsoleLink('results', 'us-east-1')).toBe(
      'https://s3.console.aws.amazon.com/s3/buckets/results?region=us-east-1'
    );
  });

  // The Output Bucket setting may carry a folder; the console takes it as a prefix, not a path.
  it('opens the folder of a bucket configured with one', () => {
    const expected =
      'https://s3.console.aws.amazon.com/s3/buckets/results?region=us-east-1&prefix=uploads%2F';
    expect(s3ConsoleLink('results/uploads/', 'us-east-1')).toBe(expected);
    expect(s3ConsoleLink('results/uploads', 'us-east-1')).toBe(expected);
  });
});

describe('getStorageUrl', () => {
  const bigQuery = {
    type: DataStorageType.GOOGLE_BIGQUERY,
    config: { projectId: 'proj', location: 'US' },
  };

  it('is null for an OWOX Storage', () => {
    const storage = { ...bigQuery, owoxStorage: { location: 'US', datasetId: 'owox_x' } };
    expect(getStorageUrl(storage as never, 'owox_x.daily')).toBeNull();
  });

  it('links a plain BigQuery table to the console', () => {
    expect(getStorageUrl(bigQuery as never, 'raw.events')).toContain(
      'https://console.cloud.google.com/bigquery?project=proj'
    );
  });
});
