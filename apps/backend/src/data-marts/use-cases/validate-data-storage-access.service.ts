import { Injectable, Logger } from '@nestjs/common';
import { DataStorageAccessValidatorFacade } from '../data-storage-types/facades/data-storage-access-validator-facade.service';
import { DataStorageCredentialsResolver } from '../data-storage-types/data-storage-credentials-resolver.service';
import { ValidationResult } from '../data-storage-types/interfaces/data-storage-access-validator.interface';
import { ValidateDataStorageAccessCommand } from '../dto/domain/validate-data-storage-access.command';
import { DataStorageService } from '../services/data-storage.service';

@Injectable()
export class ValidateDataStorageAccessService {
  private readonly logger = new Logger(ValidateDataStorageAccessService.name);

  constructor(
    private readonly dataStorageService: DataStorageService,
    private readonly dataStorageValidationFacade: DataStorageAccessValidatorFacade,
    private readonly dataStorageCredentialsResolver: DataStorageCredentialsResolver
  ) {}

  async run(command: ValidateDataStorageAccessCommand): Promise<ValidationResult> {
    const dataStorage = await this.dataStorageService.getByProjectIdAndId(
      command.projectId,
      command.id
    );

    if (!dataStorage.config) {
      return { valid: false, errorMessage: 'Storage setup is incomplete' };
    }

    if (dataStorage.credentialId) {
      try {
        const resolvedCredentials = await this.dataStorageCredentialsResolver.resolve(dataStorage);
        return await this.dataStorageValidationFacade.validateAccess(
          dataStorage.type,
          dataStorage.config,
          resolvedCredentials
        );
      } catch (error) {
        this.logger.warn(`Failed to resolve credentials for storage ${dataStorage.id}`, error);
        return {
          valid: false,
          errorMessage: error instanceof Error ? error.message : 'Failed to resolve credentials',
        };
      }
    }

    return { valid: false, errorMessage: 'Storage setup is incomplete' };
  }
}
