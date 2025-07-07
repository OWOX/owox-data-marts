import { DataDestinationType } from '../../enums';
import type { DestinationMapper } from './destination-mapper.interface.ts';
import { GoogleSheetsMapper } from './google-sheets.mapper.ts';

export const DestinationMapperFactory = {
  getMapper(type: DataDestinationType): DestinationMapper {
    switch (type) {
      case DataDestinationType.GOOGLE_SHEETS:
        return new GoogleSheetsMapper();
      default:
        throw new Error(`Unknown destination type: ${String(type)}`);
    }
  },
};
