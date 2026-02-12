import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { UpdateDataMartTitleCommand } from '../dto/domain/update-data-mart-title.command';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartService } from '../services/data-mart.service';
import { LegacyDataMartsService } from '../services/legacy-data-marts/legacy-data-marts.service';

@Injectable()
export class UpdateDataMartTitleService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly mapper: DataMartMapper,
    private readonly legacyDataMartsService: LegacyDataMartsService
  ) {}

  async run(command: UpdateDataMartTitleCommand): Promise<DataMartDto> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

    if (dataMart.storage.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY) {
      await this.legacyDataMartsService.updateTitle(dataMart.id, command.title);
    }

    dataMart.title = command.title;
    await this.dataMartService.save(dataMart);

    return this.mapper.toDomainDto(dataMart);
  }
}
