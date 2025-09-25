import { Logger } from '@nestjs/common';
import { S3Client, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { AthenaConfig } from '../schemas/athena-config.schema';
import { AthenaCredentials } from '../schemas/athena-credentials.schema';

/**
 * Adapter for S3 API operations related to Athena query results
 */
export class S3ApiAdapter {
  private readonly logger = new Logger(S3ApiAdapter.name);
  private readonly s3Client: S3Client;

  /**
   * Compatible with Athena credentials
   *
   * @param credentials - Athena credentials
   * @param config - Athena configuration
   * @throws Error if invalid credentials or config are provided
   */
  constructor(credentials: AthenaCredentials, config: AthenaConfig) {
    this.s3Client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      },
    });
  }

  /**
   * Cleans up S3 output files
   *
   * @param outputBucket - S3 bucket containing query results
   * @param outputPrefix - S3 prefix for query results
   */
  public async cleanupOutputFiles(outputBucket: string, outputPrefix: string): Promise<void> {
    if (!outputBucket || !outputPrefix) {
      this.logger.debug('No output location to clean up');
      return;
    }

    try {
      // List objects in the output location
      const listCommand = new ListObjectsV2Command({
        Bucket: outputBucket,
        Prefix: outputPrefix,
      });

      const listedObjects = await this.s3Client.send(listCommand);

      if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
        this.logger.debug('No objects to delete');
        return;
      }

      // Delete each object
      for (const object of listedObjects.Contents) {
        if (!object.Key) continue;

        const deleteCommand = new DeleteObjectCommand({
          Bucket: outputBucket,
          Key: object.Key,
        });

        await this.s3Client.send(deleteCommand);
        this.logger.debug(`Deleted object: ${object.Key}`);
      }

      this.logger.debug('Successfully cleaned up query results');
    } catch (error) {
      this.logger.error('Error cleaning up query results', error);
      throw error;
    }
  }
}
