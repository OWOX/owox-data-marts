import type { DestinationConfigDto } from '../../services';
import type { DestinationConfig } from '../types/data-mart-report';

export interface DestinationConfigMapperInterface {
  mapFromDto(dto: DestinationConfigDto): DestinationConfig;
}
