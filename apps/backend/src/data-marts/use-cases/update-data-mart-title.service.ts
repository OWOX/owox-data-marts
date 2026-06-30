import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { UpdateDataMartTitleCommand } from '../dto/domain/update-data-mart-title.command';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartService } from '../services/data-mart.service';
import { LegacyDataMartsService } from '../services/legacy-data-marts/legacy-data-marts.service';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';
import { containsNonBmpCharacters } from '../utils/contains-non-bmp-characters';
import { AdvancedSearchIndexSyncService } from '../services/advanced-search-index-sync.service';
import { SearchableEntityType } from '../../common/search/search.facade';

@Injectable()
export class UpdateDataMartTitleService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly mapper: DataMartMapper,
    private readonly legacyDataMartsService: LegacyDataMartsService,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly advancedSearchIndexSync?: AdvancedSearchIndexSyncService
  ) {}

  async run(command: UpdateDataMartTitleCommand): Promise<DataMartDto> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

    if (command.userId) {
      const canEdit = await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.DATA_MART,
        command.id,
        Action.EDIT,
        command.projectId
      );
      if (!canEdit) {
        throw new ForbiddenException('You do not have permission to edit this DataMart');
      }
    }

    if (dataMart.storage.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY) {
      if (containsNonBmpCharacters(command.title)) {
        throw new BadRequestException(
          'Title contains unsupported characters (e.g. emoji). Legacy BigQuery storage does not support these characters.'
        );
      }
      await this.legacyDataMartsService.updateTitle(dataMart.id, command.title);
    }

    dataMart.title = command.title;
    await this.dataMartService.save(dataMart);
    await this.advancedSearchIndexSync?.scheduleReindex(
      SearchableEntityType.DATA_MART,
      dataMart.id,
      command.projectId
    );

    return this.mapper.toDomainDto(dataMart);
  }
}
