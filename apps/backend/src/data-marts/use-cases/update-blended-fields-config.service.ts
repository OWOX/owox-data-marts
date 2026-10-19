import { DataSource } from 'typeorm';
import { Injectable, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { deepEqual } from '../../common/utils/deep-equal.util';
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
    private readonly dataSource: DataSource,
    private readonly reportDataCacheService: ReportDataCacheService,
    private readonly mapper: DataMartMapper,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  @Transactional()
  async run(command: UpdateBlendedFieldsConfigCommand): Promise<DataMartDto> {
    if (!command.userId) {
      throw new UnauthorizedException('Authenticated user is required');
    }

    await this.dataMartService.lockConfigurationReferences(command.projectId);
    const dataMart = await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

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

    const nextConfig = command.blendedFieldsConfig ?? undefined;
    const changed = !deepEqual(dataMart.blendedFieldsConfig ?? null, nextConfig ?? null);

    if (changed) {
      dataMart.blendedFieldsConfig = nextConfig;
      Object.assign(
        dataMart,
        await this.dataMartService.writeConfiguration(
          this.dataSource.manager,
          command.id,
          command.projectId,
          command.expectedRevision ?? dataMart.revision,
          { blendedFieldsConfig: nextConfig ?? (() => 'NULL') }
        )
      );
      await this.reportDataCacheService.invalidateByDataMartId(dataMart.id);
    }

    if (!changed)
      dataMart.revision = await this.dataMartService.advanceConfigurationRevision(
        this.dataSource.manager,
        command.id,
        command.projectId,
        command.expectedRevision ?? dataMart.revision
      );
    return this.mapper.toDomainDto(dataMart);
  }
}
