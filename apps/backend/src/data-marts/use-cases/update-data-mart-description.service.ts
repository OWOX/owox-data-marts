import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { DataMartService } from '../services/data-mart.service';
import { UpdateDataMartDescriptionCommand } from '../dto/domain/update-data-mart-description.command';
import { LegacyDataMartsService } from '../services/legacy-data-marts/legacy-data-marts.service';

@Injectable()
export class UpdateDataMartDescriptionService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly mapper: DataMartMapper,
    private readonly legacyDataMartsService: LegacyDataMartsService
  ) {}

  async run(command: UpdateDataMartDescriptionCommand): Promise<DataMartDto> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

    if (dataMart.storage.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY) {
      await this.legacyDataMartsService.updateDescription(dataMart.id, command.description);
    }

    dataMart.description = command.description;
    await this.dataMartService.save(dataMart);

    return this.mapper.toDomainDto(dataMart);
  }
}
