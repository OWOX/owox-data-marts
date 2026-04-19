import { Injectable } from '@nestjs/common';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { DataMartService } from '../services/data-mart.service';
import { UpdateBlendedFieldsConfigCommand } from '../dto/domain/update-blended-fields-config.command';

@Injectable()
export class UpdateBlendedFieldsConfigService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly mapper: DataMartMapper
  ) {}

  async run(command: UpdateBlendedFieldsConfigCommand): Promise<DataMartDto> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

    dataMart.blendedFieldsConfig = command.blendedFieldsConfig ?? undefined;
    await this.dataMartService.save(dataMart);

    return this.mapper.toDomainDto(dataMart);
  }
}
