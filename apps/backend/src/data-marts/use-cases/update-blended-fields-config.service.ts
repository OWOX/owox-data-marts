import { Injectable, ForbiddenException } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { DataMartService } from '../services/data-mart.service';
import { ReportDataCacheService } from '../services/report-data-cache.service';
import { UpdateBlendedFieldsConfigCommand } from '../dto/domain/update-blended-fields-config.command';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';

@Injectable()
export class UpdateBlendedFieldsConfigService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly reportDataCacheService: ReportDataCacheService,
    private readonly mapper: DataMartMapper,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  @Transactional()
  async run(command: UpdateBlendedFieldsConfigCommand): Promise<DataMartDto> {
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

    const nextConfig = command.blendedFieldsConfig ?? undefined;
    const changed =
      JSON.stringify(dataMart.blendedFieldsConfig ?? null) !== JSON.stringify(nextConfig ?? null);

    if (changed) {
      dataMart.blendedFieldsConfig = nextConfig;
      await this.dataMartService.save(dataMart);
      await this.reportDataCacheService.invalidateByDataMartId(dataMart.id);
    }

    return this.mapper.toDomainDto(dataMart);
  }
}
