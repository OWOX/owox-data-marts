/**
 * Where Athena writes a query's results, and the same place as an S3 bucket and key prefix.
 *
 * The Output Bucket setting may carry a folder (`results/uploads/`), the way the AWS console
 * shows a location. Athena takes the whole value as the start of its output URI, while S3
 * refuses it as a bucket name, so the cleanup of the results must split it the way the URI
 * does: the bucket is the first segment, and the key starts right after it.
 */
export function athenaOutputLocation(
  outputBucket: string,
  outputPrefix: string
): { uri: string; bucket: string; keyPrefix: string } {
  const location = `${outputBucket}/${outputPrefix}`;
  const slash = location.indexOf('/');
  return {
    uri: `s3://${location}`,
    bucket: location.slice(0, slash),
    keyPrefix: location.slice(slash + 1),
  };
}
