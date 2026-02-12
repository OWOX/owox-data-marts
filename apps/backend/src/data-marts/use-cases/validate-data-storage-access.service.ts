import { Injectable } from '@nestjs/common';
import { DataStorageAccessValidatorFacade } from '../data-storage-types/facades/data-storage-access-validator-facade.service';
import { ValidationResult } from '../data-storage-types/interfaces/data-storage-access-validator.interface';
import { ValidateDataStorageAccessCommand } from '../dto/domain/validate-data-storage-access.command';
import { DataStorageService } from '../services/data-storage.service';

@Injectable()
export class ValidateDataStorageAccessService {
  constructor(
    private readonly dataStorageService: DataStorageService,
    private readonly dataStorageValidationFacade: DataStorageAccessValidatorFacade
  ) {}

  async run(command: ValidateDataStorageAccessCommand): Promise<ValidationResult> {
    const dataStorage = await this.dataStorageService.getByProjectIdAndId(
      command.projectId,
      command.id
    );

    if (!dataStorage.config || !dataStorage.credentials) {
      return { valid: false, errorMessage: 'Storage setup is incomplete' };
    }

    return await this.dataStorageValidationFacade.validateAccess(
      dataStorage.type,
      dataStorage.config,
      dataStorage.credentials
    );
  }
}
