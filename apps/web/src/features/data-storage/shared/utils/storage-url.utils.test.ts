import { describe, it, expect } from 'vitest';
import { s3ConsoleLink } from './storage-url.utils';

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
