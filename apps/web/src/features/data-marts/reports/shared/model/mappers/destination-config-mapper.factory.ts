import { DestinationTypeConfigEnum } from '../../enums';
import type { DestinationConfigMapperInterface } from './destination-config-mapper.interface';
import { EmailConfigMapper } from './email-config.mapper.ts';
import { ExcelConfigMapper } from './excel-config.mapper';
import { GoogleSheetsConfigMapper } from './google-sheets-config.mapper';
import { LookerStudioConfigMapper } from './looker-studio-config.mapper';

export const DestinationConfigMapperFactory = {
  getMapper(type: DestinationTypeConfigEnum): DestinationConfigMapperInterface {
    switch (type) {
      case DestinationTypeConfigEnum.GOOGLE_SHEETS_CONFIG:
        return new GoogleSheetsConfigMapper();
      case DestinationTypeConfigEnum.LOOKER_STUDIO_CONFIG:
        return new LookerStudioConfigMapper();
      case DestinationTypeConfigEnum.EXCEL_CONFIG:
        return new ExcelConfigMapper();
      case DestinationTypeConfigEnum.EMAIL_CONFIG:
        return new EmailConfigMapper();
      default:
        throw new Error(`Unknown destination config type: ${String(type)}`);
    }
  },
};
