import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DeleteDataStorageCommand } from '../dto/domain/delete-data-storage.command';
import { DataStorage } from '../entities/data-storage.entity';
import { DataMartService } from '../services/data-mart.service';
import { DataStorageService } from '../services/data-storage.service';

@Injectable()
export class DeleteDataStorageService {
  constructor(
    @InjectRepository(DataStorage)
    private readonly dataStorageRepository: Repository<DataStorage>,
    private readonly dataStorageService: DataStorageService,
    private readonly dataMartService: DataMartService
  ) {}

  async run(command: DeleteDataStorageCommand): Promise<void> {
    const dataStorage = await this.dataStorageService.getByIdAndProjectId(
      command.projectId,
      command.id
    );

    if (dataStorage.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY) {
      throw new BusinessViolationException(
        "Legacy Google BigQuery storage can't be deleted manually."
      );
    }

    const dataMartsForStorage = await this.dataMartService.findByStorage(dataStorage);

    if (dataMartsForStorage.length > 0) {
      throw new BusinessViolationException(
        'Cannot delete the storage because it is referenced by existing data marts.',
        { referencedDataMarts: dataMartsForStorage.map(mart => mart.id) }
      );
    }

    await this.dataStorageRepository.softDelete({
      id: command.id,
      projectId: command.projectId,
    });
  }
}
