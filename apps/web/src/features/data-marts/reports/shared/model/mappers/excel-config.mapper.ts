import { DestinationTypeConfigEnum } from '../../enums';
import type { DestinationConfig } from '../types/data-mart-report';
import type { DestinationConfigDto } from '../../services';
import type { DestinationConfigMapperInterface } from './destination-config-mapper.interface';

export class ExcelConfigMapper implements DestinationConfigMapperInterface {
  mapFromDto(dto: DestinationConfigDto): DestinationConfig {
    if (dto.type !== DestinationTypeConfigEnum.EXCEL_CONFIG) {
      throw new Error('Invalid destination config type');
    }

    return { type: DestinationTypeConfigEnum.EXCEL_CONFIG };
  }
}
