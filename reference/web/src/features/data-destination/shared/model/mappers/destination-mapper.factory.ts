import { DataDestinationType } from '../../enums';
import type { DestinationMapper } from './destination-mapper.interface.ts';
import { GoogleSheetsMapper } from './google-sheets.mapper.ts';
import { LookerStudioMapper } from './looker-studio.mapper.ts';

export const DestinationMapperFactory = {
  getMapper(type: DataDestinationType): DestinationMapper {
    switch (type) {
      case DataDestinationType.GOOGLE_SHEETS:
        return new GoogleSheetsMapper();
      case DataDestinationType.LOOKER_STUDIO:
        return new LookerStudioMapper();
      default:
        throw new Error(`Unknown destination type: ${type}`);
    }
  },
};
