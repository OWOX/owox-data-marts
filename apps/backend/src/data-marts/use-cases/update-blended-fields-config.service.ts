import { Injectable } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { DataMartService } from '../services/data-mart.service';
import { ReportDataCacheService } from '../services/report-data-cache.service';
import { UpdateBlendedFieldsConfigCommand } from '../dto/domain/update-blended-fields-config.command';

@Injectable()
export class UpdateBlendedFieldsConfigService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly reportDataCacheService: ReportDataCacheService,
    private readonly mapper: DataMartMapper
  ) {}

  @Transactional()
  async run(command: UpdateBlendedFieldsConfigCommand): Promise<DataMartDto> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

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
