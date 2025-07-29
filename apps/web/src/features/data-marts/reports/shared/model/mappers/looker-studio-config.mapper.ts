import { DestinationTypeConfigEnum } from '../../enums';
import type { DestinationConfig } from '../types/data-mart-report';
import type { DestinationConfigDto } from '../../services';
import type { DestinationConfigMapperInterface } from './destination-config-mapper.interface';

export class LookerStudioConfigMapper implements DestinationConfigMapperInterface {
  mapFromDto(dto: DestinationConfigDto): DestinationConfig {
    if (dto.type !== DestinationTypeConfigEnum.LOOKER_STUDIO_CONFIG) {
      throw new Error('Invalid destination config type');
    }

    return {
      type: DestinationTypeConfigEnum.LOOKER_STUDIO_CONFIG,
      cacheTime: dto.cacheTime,
    };
  }
}
