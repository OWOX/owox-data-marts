import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import {
  DataStorageAccessValidator,
  ValidationResult,
} from '../../interfaces/data-storage-access-validator.interface';
import { DataStorageConfig } from '../../data-storage-config.type';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { DuckDbConfigSchema } from '../schemas/duckdb-config.schema';
import { resolveDuckDbDataDir } from '../utils/duckdb-path.utils';

/**
 * Validates access to the DuckDB storage type.
 *
 * DuckDB is credential-less and file-backed: "access" means the configured
 * data directory exists (or can be created) and is writable by this process.
 */
@Injectable()
export class DuckDbAccessValidator implements DataStorageAccessValidator {
  readonly type = DataStorageType.DUCKDB;
  private readonly logger = new Logger(DuckDbAccessValidator.name);

  constructor(private readonly configService: ConfigService) {}

  async validate(
    config: DataStorageConfig,
    _credentials: DataStorageCredentials
  ): Promise<ValidationResult> {
    const parsed = DuckDbConfigSchema.safeParse(config);
    if (!parsed.success) {
      this.logger.warn('Invalid config', parsed.error);
      return ValidationResult.failure('Invalid DuckDB config', { errors: parsed.error.issues });
    }

    const dir = resolveDuckDbDataDir(this.configService);
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      return ValidationResult.success();
    } catch (error) {
      this.logger.warn('Access validation failed', error);
      return ValidationResult.failure(`DuckDB data directory not writable: ${dir}`, {
        error: String(error),
      });
    }
  }
}
